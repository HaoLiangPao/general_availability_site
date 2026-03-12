#!/usr/bin/env node
/**
 * scripts/migrate.mjs
 *
 * One-time script to create the required tables in your Postgres database.
 * Run after setting up Neon / Vercel Postgres and adding POSTGRES_URL to .env.local:
 *
 *   npm run migrate
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

// Load .env.local so POSTGRES_URL is available
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
  console.error('Get your Neon connection string from:');
  console.error('  https://console.neon.tech → your project → Connection details\n');
  process.exit(1);
}

const sql = neon(url);

console.log('\n⏳  Running database migrations…\n');

// Enable btree_gist for exclusion constraints
await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;
console.log('  ✅  btree_gist extension enabled');

await sql`
  CREATE TABLE IF NOT EXISTS bookings (
    id                SERIAL PRIMARY KEY,
    type              TEXT NOT NULL,
    date              TEXT NOT NULL,
    time              TEXT NOT NULL,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL,
    notes             TEXT,
    status            TEXT NOT NULL DEFAULT 'confirmed',
    confirm_token     TEXT,
    calendar_event_id TEXT,
    start_at          TIMESTAMPTZ NOT NULL,
    end_at            TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('  ✅  bookings table ready');

// Idempotent column additions (for upgrades from older schema)
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed'`;
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirm_token TEXT`;
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_event_id TEXT`;
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`;
await sql`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ`;
console.log('  ✅  bookings columns aligned');

// Hard check: legacy rows with NULL start_at/end_at break availability and overlap enforcement.
// Must be resolved before the constraint or index can be created.
const nullRows = await sql`
  SELECT count(*) as cnt FROM bookings WHERE start_at IS NULL OR end_at IS NULL
`;
const nullCount = Number(nullRows[0]?.cnt ?? 0);
if (nullCount > 0) {
  console.error(`\n  ❌  ${nullCount} booking(s) have NULL start_at/end_at timestamps.`);
  console.error('     These rows are invisible to availability checks and overlap enforcement.');
  console.error('     Run first:  node scripts/migrate-timestamps.mjs');
  console.error('     Then re-run: npm run migrate\n');
  process.exit(1);
}

// Exclusion constraint (idempotent)
const constraintExists = await sql`
  SELECT 1 FROM pg_constraint WHERE conname = 'no_overlap_active'
`;
if (constraintExists.length === 0) {
  await sql`
    ALTER TABLE bookings
    ADD CONSTRAINT no_overlap_active
    EXCLUDE USING gist (
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status IN ('pending', 'confirmed'))
  `;
  console.log('  ✅  exclusion constraint created');
} else {
  console.log('  ✅  exclusion constraint already exists');
}

// GiST index for fast range lookups (idempotent)
const indexExists = await sql`
  SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bookings_time_range'
`;
if (indexExists.length === 0) {
  try {
    await sql`
      CREATE INDEX idx_bookings_time_range
      ON bookings USING gist (tstzrange(start_at, end_at, '[)'))
      WHERE status IN ('pending', 'confirmed')
    `;
    console.log('  ✅  time range index created');
  } catch (e) {
    console.warn('  ⚠️  Could not create index:', e.message);
  }
} else {
  console.log('  ✅  time range index already exists');
}

await sql`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('  ✅  admin_sessions table ready');

await sql`
  CREATE TABLE IF NOT EXISTS slot_overrides (
    id         SERIAL PRIMARY KEY,
    date       TEXT NOT NULL,
    time       TEXT NOT NULL,
    action     TEXT NOT NULL CHECK (action IN ('block', 'force_open')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(date, time)
  )
`;
console.log('  ✅  slot_overrides table ready');

console.log('\n✅  Migration complete!\n');

