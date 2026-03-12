/**
 * test-timestamp-migration.mjs
 *
 * Tests after the start_at/end_at migration:
 *
 * 1. Book a slot → verify start_at/end_at are populated correctly
 * 2. Try to book an overlapping slot → verify 409 conflict from DB constraint
 * 3. Verify availability endpoint correctly blocks the booked slot
 * 4. Delete the booking → verify the slot is freed
 * 5. Book the same slot again → should succeed now
 * 6. Cleanup
 */

import { readFileSync, existsSync } from 'fs';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const BASE = 'http://localhost:3000';
const TEST_EMAIL = 'haodoyoufeeltoday@gmail.com';
const TEST_DATE = '2026-03-17'; // Tuesday

// ─── Helpers ─────────────────────────────────────────────────────────
function section(t) { console.log(`\n${'═'.repeat(70)}\n ${t}\n${'═'.repeat(70)}`); }
function ok(m) { console.log(`  ✅ ${m}`); }
function fail(m) { console.log(`  ❌ ${m}`); }
function info(m) { console.log(`  ℹ️  ${m}`); }

let pass = 0, fails = 0;
function check(c, p, f) { if (c) { ok(p); pass++; } else { fail(f); fails++; } }

let adminCookie;
async function ensureAdmin() {
  if (adminCookie) return;
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin' }),
    redirect: 'manual',
  });
  const c = r.headers.getSetCookie?.() || [];
  adminCookie = c.find(x => x.startsWith('admin_session='));
  if (!adminCookie) adminCookie = r.headers.get('set-cookie');
  if (adminCookie) adminCookie = adminCookie.split(';')[0];
}

async function getBookings() {
  await ensureAdmin();
  const r = await fetch(`${BASE}/api/admin/stats`, { headers: { Cookie: adminCookie } });
  return (await r.json()).bookings ?? [];
}

async function deleteBooking(id) {
  await ensureAdmin();
  return await (await fetch(`${BASE}/api/admin/stats`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id, reason: 'E2E test cleanup' }),
  })).json();
}

async function book(type, time, name) {
  return await fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, date: TEST_DATE, time, name, email: TEST_EMAIL, notes: 'E2E test' }),
  });
}

// ══════════════════════════════════════════════════════════════════════
// Test 1: Book a coffee chat at 11:00 AM
// ══════════════════════════════════════════════════════════════════════

section('TEST 1: Book a coffee chat → verify start_at/end_at');

const res1 = await book('coffee', '11:00 AM', 'Timestamp Test 1');
const data1 = await res1.json();
check(res1.status === 200 && data1.success, `Booking created (ID: ${data1.id})`, `Booking failed: ${JSON.stringify(data1)}`);

const bookingId1 = data1.id;

// Verify in DB
const all1 = await getBookings();
const b1 = all1.find(b => b.id === bookingId1);

if (b1) {
  check(!!b1.start_at, `start_at populated: ${b1.start_at}`, 'start_at is NULL!');
  check(!!b1.end_at, `end_at populated: ${b1.end_at}`, 'end_at is NULL!');

  // Coffee = 30 min, so end_at should be start_at + 30 min
  const startMs = new Date(b1.start_at).getTime();
  const endMs = new Date(b1.end_at).getTime();
  const diffMin = (endMs - startMs) / 60_000;
  check(diffMin === 30, `Duration is correct: ${diffMin} minutes (expected 30 for coffee)`, `Duration mismatch: ${diffMin} min`);

  info(`start_at: ${b1.start_at}`);
  info(`end_at:   ${b1.end_at}`);
} else {
  fail('Booking not found in DB');
}

// ══════════════════════════════════════════════════════════════════════
// Test 2: Try to book overlapping slot → expect 409
// ══════════════════════════════════════════════════════════════════════

section('TEST 2: Book overlapping slot → expect 409 from DB constraint');

// Coffee at 11:00 AM occupies 11:00-11:30. Try another 30-min booking at 11:00 AM
const res2a = await book('coffee', '11:00 AM', 'Overlap Test Exact');
const data2a = await res2a.json();
check(res2a.status === 409, `Exact overlap → 409 ✓ (error: "${data2a.error}")`, `Expected 409, got ${res2a.status}: ${JSON.stringify(data2a)}`);

// Try a different type at the same time (interview at 11:00 takes 11:00-11:45, overlaps with 11:00-11:30)
const res2b = await book('interview', '11:00 AM', 'Overlap Test Different Type');
const data2b = await res2b.json();
check(res2b.status === 409, `Cross-type overlap → 409 ✓ (error: "${data2b.error}")`, `Expected 409, got ${res2b.status}: ${JSON.stringify(data2b)}`);

// Try a 60-min in_person at 10:30 AM (10:30-11:30, overlaps with 11:00-11:30)
const res2c = await book('in_person', '10:30 AM', 'Overlap Test Partial Start');
const data2c = await res2c.json();
check(res2c.status === 409, `Partial overlap (before) → 409 ✓`, `Expected 409, got ${res2c.status}: ${JSON.stringify(data2c)}`);

// ══════════════════════════════════════════════════════════════════════
// Test 3: Non-overlapping slot should succeed
// ══════════════════════════════════════════════════════════════════════

section('TEST 3: Book non-overlapping slot → should succeed');

// Coffee ends at 11:30, so 11:30 AM should be free
const res3 = await book('coffee', '11:30 AM', 'Non-Overlap Test');
const data3 = await res3.json();
check(res3.status === 200 && data3.success, `Adjacent slot at 11:30 AM → OK (ID: ${data3.id})`, `Expected success, got ${res3.status}: ${JSON.stringify(data3)}`);

const bookingId3 = data3.id;

// ══════════════════════════════════════════════════════════════════════
// Test 4: Verify availability endpoint
// ══════════════════════════════════════════════════════════════════════

section('TEST 4: Verify availability endpoint uses start_at/end_at');

const availRes = await fetch(`${BASE}/api/availability?date=${TEST_DATE}&type=coffee`);
const availData = await availRes.json();
const slots = availData.slots ?? [];

const slot1100 = slots.find(s => s.time === '11:00 AM');
const slot1130 = slots.find(s => s.time === '11:30 AM');
const slot0930 = slots.find(s => s.time === '10:00 AM');

check(slot1100 && !slot1100.available, '11:00 AM is blocked (booked coffee)', '11:00 AM should be blocked!');
check(slot1130 && !slot1130.available, '11:30 AM is blocked (booked coffee)', '11:30 AM should be blocked!');
check(slot0930 && slot0930.available, '10:00 AM is free ✓', '10:00 AM should be free!');

// ══════════════════════════════════════════════════════════════════════
// Test 5: Delete booking → slot freed → re-book succeeds
// ══════════════════════════════════════════════════════════════════════

section('TEST 5: Delete → free slot → re-book');

// Delete the 11:00 AM coffee
const del1 = await deleteBooking(bookingId1);
check(del1.success, `Booking #${bookingId1} deleted`, `Delete failed: ${JSON.stringify(del1)}`);

// Now 11:00 AM should be bookable again
const res5 = await book('coffee', '11:00 AM', 'Re-book After Delete');
const data5 = await res5.json();
check(res5.status === 200 && data5.success, `Re-book at 11:00 AM → OK (ID: ${data5.id})`, `Expected success, got ${res5.status}: ${JSON.stringify(data5)}`);

const bookingId5 = data5.id;

// ══════════════════════════════════════════════════════════════════════
// Cleanup
// ══════════════════════════════════════════════════════════════════════

section('CLEANUP');

for (const id of [bookingId3, bookingId5]) {
  if (id) {
    const r = await deleteBooking(id);
    check(r.success, `Booking #${id} cleaned up`, `Cleanup failed for #${id}`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════

section('SUMMARY');
console.log(`  Results: ${pass} passed, ${fails} failed`);
console.log();
if (fails === 0) {
  console.log('  🎉 ALL TESTS PASSED!');
  console.log();
  console.log('  The DB-level exclusion constraint is working correctly:');
  console.log('  • Exact overlaps → 409');
  console.log('  • Cross-type overlaps → 409');
  console.log('  • Partial overlaps → 409');
  console.log('  • Adjacent (non-overlapping) → succeeds');
  console.log('  • Delete → re-book same slot → succeeds');
  console.log('  • Availability endpoint uses start_at/end_at correctly');
} else {
  console.log('  ⚠️  Some tests failed — review above.');
}
console.log();
