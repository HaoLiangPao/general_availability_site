#!/usr/bin/env node
/**
 * scripts/migrate-timestamps.mjs
 *
 * Migration: Add start_at / end_at TIMESTAMPTZ columns and
 * a btree_gist exclusion constraint for no-overlap guarantees.
 *
 * Steps:
 *   1. Add start_at, end_at columns (IF NOT EXISTS)
 *   2. Enable btree_gist extension
 *   3. Backfill existing rows from date + time + type
 *   4. Make start_at/end_at NOT NULL (after backfill)
 *   5. Add exclusion constraint (no overlapping active bookings)
 *
 * Usage:  node scripts/migrate-timestamps.mjs
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

// ─── Load .env.local ─────────────────────────────────────────────────
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const { neon } = require('@neondatabase/serverless');
const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('\n❌  POSTGRES_URL is not set in .env.local\n');
  process.exit(1);
}

const sql = neon(url);

// ─── Duration map (must match src/lib/booking.ts) ────────────────────
const DURATIONS = {
  interview: 45,
  coffee: 30,
  in_person: 60,
  ski_lesson: 60,
};

// ─── Time parser (replicates parseDateTimeLocal from calendar.ts) ────
const HOST_TIMEZONE = process.env.HOST_TIMEZONE ?? 'America/Toronto';

function getTimeZoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(v.year), Number(v.month) - 1, Number(v.day),
    Number(v.hour), Number(v.minute), Number(v.second),
  );
  return asUtc - date.getTime();
}

function parseDateTimeLocal(dateStr, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  const wallClockUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  let actualUtc = wallClockUtc;
  for (let i = 0; i < 2; i++) {
    actualUtc = wallClockUtc - getTimeZoneOffsetMs(new Date(actualUtc), HOST_TIMEZONE);
  }
  return new Date(actualUtc);
}

// ─── Migration ───────────────────────────────────────────────────────

console.log('\n⏳  Running timestamp migration…\n');

// 1. Add columns
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`;
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_at   TIMESTAMPTZ`;
console.log('  ✅  start_at / end_at columns added');

// 2. Enable btree_gist
await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;
console.log('  ✅  btree_gist extension enabled');

// 3. Backfill existing rows
const existing = await sql`SELECT id, date, time, type, start_at FROM bookings`;
let backfilled = 0;
let skipped = 0;

for (const row of existing) {
  // Skip rows that already have start_at populated
  if (row.start_at) {
    skipped++;
    continue;
  }

  try {
    const durationMinutes = DURATIONS[row.type] ?? 45;
    const startDt = parseDateTimeLocal(row.date, row.time);
    const endDt = new Date(startDt.getTime() + durationMinutes * 60_000);

    await sql`
      UPDATE bookings
      SET start_at = ${startDt.toISOString()}::timestamptz,
          end_at   = ${endDt.toISOString()}::timestamptz
      WHERE id = ${row.id}
    `;
    backfilled++;
  } catch (err) {
    console.error(`  ⚠️  Failed to backfill booking #${row.id} (date=${row.date}, time=${row.time}):`, err.message);
  }
}
console.log(`  ✅  Backfilled ${backfilled} rows (${skipped} already had timestamps)`);

// 4. Check for any remaining nulls
const nullCheck = await sql`SELECT count(*) as cnt FROM bookings WHERE start_at IS NULL OR end_at IS NULL`;
const nullCount = Number(nullCheck[0]?.cnt ?? 0);

if (nullCount > 0) {
  console.error(`\n  ❌  ${nullCount} rows still have NULL start_at/end_at — cannot add NOT NULL constraint.`);
  console.error('     Fix these rows manually, then re-run this script.\n');
  process.exit(1);
}

// 5. Make columns NOT NULL (safe now that all rows are backfilled)
await sql`ALTER TABLE bookings ALTER COLUMN start_at SET NOT NULL`;
await sql`ALTER TABLE bookings ALTER COLUMN end_at   SET NOT NULL`;
console.log('  ✅  start_at / end_at set to NOT NULL');

// 6. Check for existing overlaps before adding constraint
const overlaps = await sql`
  SELECT a.id AS id_a, b.id AS id_b, a.start_at, a.end_at, b.start_at AS b_start, b.end_at AS b_end
  FROM bookings a
  JOIN bookings b ON a.id < b.id
  WHERE a.status IN ('pending', 'confirmed')
    AND b.status IN ('pending', 'confirmed')
    AND a.start_at < b.end_at
    AND a.end_at > b.start_at
`;

if (overlaps.length > 0) {
  console.warn(`\n  ⚠️  Found ${overlaps.length} overlapping booking pair(s):`);
  for (const o of overlaps) {
    console.warn(`     #${o.id_a} [${o.start_at} – ${o.end_at}] overlaps #${o.id_b} [${o.b_start} – ${o.b_end}]`);
  }
  console.warn('     Resolve these overlaps, then re-run to add the exclusion constraint.');
  console.warn('     (Columns and backfill are already done — only the constraint is skipped.)\n');
  process.exit(0);
}

// 7. Add exclusion constraint (idempotent — use IF NOT EXISTS via a check)
const constraintExists = await sql`
  SELECT 1 FROM pg_constraint WHERE conname = 'no_overlap_active'
`;

if (constraintExists.length > 0) {
  console.log('  ✅  Exclusion constraint "no_overlap_active" already exists');
} else {
  await sql`
    ALTER TABLE bookings
    ADD CONSTRAINT no_overlap_active
    EXCLUDE USING gist (
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'))
  `;
  console.log('  ✅  Exclusion constraint "no_overlap_active" created');
}

// 8. Add an index for fast range lookups
const indexExists = await sql`
  SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_time_range'
`;

if (indexExists.length > 0) {
  console.log('  ✅  Index "idx_bookings_time_range" already exists');
} else {
  await sql`
    CREATE INDEX idx_bookings_time_range
    ON bookings USING gist (tstzrange(start_at, end_at, '[)'))
    WHERE status IN ('pending', 'confirmed')
  `;
  console.log('  ✅  Index "idx_bookings_time_range" created');
}

console.log('\n✅  Timestamp migration complete!\n');
