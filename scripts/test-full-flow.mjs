/**
 * test-full-flow.mjs
 *
 * Comprehensive E2E test covering ALL booking types and the complete flow:
 *
 * Phase 1: Create bookings of ALL types on the SAME date/overlapping times
 *   - interview  (45 min) at 10:00 AM → pending (needs host confirm)
 *   - coffee     (30 min) at 11:00 AM → confirmed immediately
 *   - in_person  (60 min) at 01:00 PM → confirmed immediately
 *   - ski_lesson (60 min) at 02:30 PM → confirmed immediately
 *
 * Phase 2: Verify time-slot blocking
 *   - Hit /api/availability for the same date,
 *     confirm the booked slots are marked unavailable
 *
 * Phase 3: Interview confirmation flow
 *   - The interview is left PENDING so the user can click the confirm
 *     link from the owner email
 *   - Print the confirm link so the user can manually test it
 *
 * Phase 4: Cleanup (optional — only the non-interview bookings)
 *   - Delete the non-interview bookings so they don't clutter
 *   - Leave the interview for manual confirmation testing
 *
 * Guest email: haodoyoufeeltoday@gmail.com
 */

import { readFileSync, existsSync } from 'fs';

// ─── Load .env.local ────────────────────────────────────────────────
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

const BASE = 'http://localhost:3000';
const TEST_EMAIL = 'haodoyoufeeltoday@gmail.com';
const BOOKING_DATE = '2026-03-16'; // Monday, safe future date

// ─── Helpers ─────────────────────────────────────────────────────────

function section(title) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(` ${title}`);
  console.log(`${'═'.repeat(70)}`);
}
function ok(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }
function info(msg) { console.log(`  ℹ️  ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }

let passCount = 0;
let failCount = 0;
function check(cond, passMsg, failMsg) {
  if (cond) { ok(passMsg); passCount++; }
  else { fail(failMsg); failCount++; }
}

// ─── Admin session ───────────────────────────────────────────────────

let adminCookie;
async function ensureAdmin() {
  if (adminCookie) return;
  const loginRes = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME ?? 'admin',
      password: process.env.ADMIN_PASSWORD ?? 'admin',
    }),
    redirect: 'manual',
  });
  const cookies = loginRes.headers.getSetCookie?.() || [];
  adminCookie = cookies.find(c => c.startsWith('admin_session='));
  if (!adminCookie) {
    const sc = loginRes.headers.get('set-cookie');
    if (sc) adminCookie = sc;
  }
  if (adminCookie) adminCookie = adminCookie.split(';')[0];
}

async function getBookings() {
  await ensureAdmin();
  const res = await fetch(`${BASE}/api/admin/stats`, {
    headers: { 'Cookie': adminCookie },
  });
  const data = await res.json();
  return data.bookings ?? [];
}

async function deleteBooking(id) {
  await ensureAdmin();
  const res = await fetch(`${BASE}/api/admin/stats`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
    body: JSON.stringify({ id }),
  });
  return await res.json();
}

// ─── Phase 1: Create bookings of all types ───────────────────────────

const BOOKINGS_TO_CREATE = [
  { type: 'interview',  time: '10:00 AM', name: 'Test Interview User',  duration: 45 },
  { type: 'coffee',     time: '11:00 AM', name: 'Test Coffee User',     duration: 30 },
  { type: 'in_person',  time: '01:00 PM', name: 'Test In-Person User',  duration: 60 },
  { type: 'ski_lesson', time: '02:30 PM', name: 'Test Ski Lesson User', duration: 60 },
];

const createdBookings = []; // { id, type, time, status, calendar_event_id, confirm_token }

section('PHASE 1: Create bookings of ALL types');
info(`Date: ${BOOKING_DATE} (Monday)`);
info(`Guest email: ${TEST_EMAIL}`);
console.log();

for (const b of BOOKINGS_TO_CREATE) {
  const label = `${b.type.toUpperCase()} at ${b.time}`;
  info(`Creating ${label}...`);

  try {
    const res = await fetch(`${BASE}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: b.type,
        date: BOOKING_DATE,
        time: b.time,
        name: b.name,
        email: TEST_EMAIL,
        notes: `E2E test — ${b.type} booking. Ignore this.`,
      }),
    });
    const data = await res.json();
    check(data.success && data.id, `${label} → created (ID: ${data.id})`, `${label} → FAILED: ${JSON.stringify(data)}`);
    if (data.id) createdBookings.push({ ...b, id: data.id });
  } catch (err) {
    fail(`${label} → network error: ${err.message}`);
    failCount++;
  }
}

// Give a tiny pause for DB writes to settle
await new Promise(r => setTimeout(r, 500));

// ─── Phase 1b: Verify all bookings in DB ─────────────────────────────

section('PHASE 1b: Verify bookings in DB + Calendar events + Statuses');

const allBookings = await getBookings();
let interviewConfirmToken = null;
let interviewConfirmLink = null;

for (const created of createdBookings) {
  const dbRow = allBookings.find(b => b.id === created.id);
  const label = `${created.type.toUpperCase()} (ID: ${created.id})`;

  if (!dbRow) {
    fail(`${label} — not found in DB!`);
    failCount++;
    continue;
  }

  // Status check
  const expectedStatus = created.type === 'interview' ? 'pending' : 'confirmed';
  check(
    dbRow.status === expectedStatus,
    `${label} → status="${dbRow.status}" ✓`,
    `${label} → expected "${expectedStatus}", got "${dbRow.status}"`
  );

  // Calendar event
  check(
    !!dbRow.calendar_event_id,
    `${label} → Calendar event created (${dbRow.calendar_event_id})`,
    `${label} → NO calendar event!`
  );

  // Confirm token (only interview should have one)
  if (created.type === 'interview') {
    check(
      !!dbRow.confirm_token,
      `${label} → confirm_token generated`,
      `${label} → missing confirm_token!`
    );
    interviewConfirmToken = dbRow.confirm_token;
    interviewConfirmLink = `${BASE}/api/confirm?token=${interviewConfirmToken}`;
  } else {
    check(
      !dbRow.confirm_token,
      `${label} → no confirm_token (correct for non-interview)`,
      `${label} → has unexpected confirm_token`
    );
  }
}

// ─── Phase 2: Verify time-slot blocking ──────────────────────────────

section('PHASE 2: Verify time-slot blocking via /api/availability');

// We'll check availability for multiple types to verify blocking
const typesToCheck = ['interview', 'coffee', 'in_person', 'ski_lesson'];

for (const checkType of typesToCheck) {
  info(`Checking availability for type="${checkType}" on ${BOOKING_DATE}...`);

  const res = await fetch(`${BASE}/api/availability?date=${BOOKING_DATE}&type=${checkType}`);
  const data = await res.json();
  const slots = data.slots ?? [];

  // The booked times should be unavailable
  const bookedTimes = createdBookings.map(b => b.time);

  for (const bookedTime of bookedTimes) {
    const slot = slots.find(s => s.time === bookedTime);
    if (slot) {
      check(
        !slot.available,
        `  ${checkType}: ${bookedTime} is BLOCKED ✓`,
        `  ${checkType}: ${bookedTime} should be blocked but is AVAILABLE!`
      );
    } else {
      info(`  ${checkType}: ${bookedTime} not in candidate list (OK — different grid)`);
    }
  }

  // Show a summary of all slots
  const availableSlots = slots.filter(s => s.available).map(s => s.time);
  const blockedSlots = slots.filter(s => !s.available).map(s => s.time);
  info(`  Available: ${availableSlots.length} slots → ${availableSlots.join(', ') || '(none)'}`);
  info(`  Blocked:   ${blockedSlots.length} slots → ${blockedSlots.join(', ') || '(none)'}`);
  console.log();
}

// ─── Phase 3: Email summary ──────────────────────────────────────────

section('PHASE 3: Email Verification');

console.log(`
  The following emails should have been sent during Phase 1:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ For EACH booking (interview, coffee, in_person, ski_lesson):            │
  │                                                                         │
  │  📧 Owner notification email → ${process.env.OWNER_EMAIL}              │
  │     Subject: "New booking: {type} with {name} on ${BOOKING_DATE}..."    │
  │     Contains: guest details, notes                                      │
  │                                                                         │
  │  📧 For non-interview types (coffee, in_person, ski_lesson):            │
  │     The calendar event was created with sendUpdates='none',             │
  │     so Google does NOT auto-send invites to guest.                       │
  │     ⚠️  Guest only sees the UI confirmation, no email for these types.  │
  │                                                                         │
  │  📧 For interview type:                                                 │
  │     Owner email has a CONFIRM LINK.                                     │
  │     When host clicks it:                                                │
  │       1. Status → confirmed                                             │
  │       2. Guest added as calendar attendee (sendUpdates='all')           │
  │       3. Gmail API sends "Interview Confirmed" email to guest           │
  └─────────────────────────────────────────────────────────────────────────┘
`);

if (interviewConfirmLink) {
  console.log(`  🔗 INTERVIEW CONFIRM LINK (click this to test Step 2 → 3):`);
  console.log(`     ${interviewConfirmLink}`);
  console.log();
  console.log(`  After clicking the link above, verify:`);
  console.log(`    1. The page shows "Interview Confirmed Successfully ✅"`);
  console.log(`    2. ${TEST_EMAIL} receives "Interview Confirmed with Hao Liang" email`);
  console.log(`    3. ${TEST_EMAIL} receives a Google Calendar invitation`);
}

// ─── Phase 4: Cleanup non-interview bookings ─────────────────────────

section('PHASE 4: Cleanup (delete non-interview bookings)');

for (const created of createdBookings) {
  if (created.type === 'interview') {
    warn(`Keeping INTERVIEW (ID: ${created.id}) for manual confirm testing`);
    continue;
  }
  const label = `${created.type.toUpperCase()} (ID: ${created.id})`;
  try {
    const result = await deleteBooking(created.id);
    check(result.success, `${label} → deleted + cancellation email sent to ${TEST_EMAIL}`, `${label} → delete failed: ${JSON.stringify(result)}`);
  } catch (err) {
    fail(`${label} → delete error: ${err.message}`);
    failCount++;
  }
}

// ─── Verify blocking after cleanup ───────────────────────────────────

section('PHASE 4b: Verify slots freed after cleanup');

const postCleanupRes = await fetch(`${BASE}/api/availability?date=${BOOKING_DATE}&type=interview`);
const postCleanupData = await postCleanupRes.json();
const postCleanupSlots = postCleanupData.slots ?? [];

// The interview at 10:00 AM should still be blocked
const tenAmSlot = postCleanupSlots.find(s => s.time === '10:00 AM');
check(
  tenAmSlot && !tenAmSlot.available,
  '10:00 AM still blocked (interview still pending)',
  '10:00 AM should still be blocked by the pending interview!'
);

// The other times should now be available again
for (const freedTime of ['11:00 AM', '01:00 PM', '02:30 PM']) {
  const s = postCleanupSlots.find(sl => sl.time === freedTime);
  if (s) {
    check(s.available, `${freedTime} is now FREE again ✓`, `${freedTime} should be free but is still blocked!`);
  }
}

// ─── Final summary ──────────────────────────────────────────────────

section('FINAL SUMMARY');

console.log(`  Results: ${passCount} passed, ${failCount} failed`);
console.log();
if (failCount === 0) {
  console.log('  🎉 ALL TESTS PASSED!');
} else {
  console.log('  ⚠️  Some tests failed — review above.');
}

console.log(`
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  MANUAL STEPS REMAINING:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  1. Check ${process.env.OWNER_EMAIL} inbox:
     → Should have 4 "New booking" emails (one per type)
     → The interview email has a CONFIRM LINK
  
  2. Click the CONFIRM LINK from the interview email:
     ${interviewConfirmLink ?? '(not available)'}
     → Should see "Interview Confirmed Successfully ✅"
  
  3. Check ${TEST_EMAIL} inbox:
     → Should have 3 "Booking Cancelled" emails (coffee, in_person, ski_lesson)
     → After clicking confirm link: should get "Interview Confirmed" email
     → After clicking confirm link: should get a Google Calendar invitation
  
  4. Check Google Calendar:
     → Interview event should appear on ${BOOKING_DATE} at 10:00 AM
     → Other 3 events should have been deleted
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
