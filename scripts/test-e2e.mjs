#!/usr/bin/env node
/**
 * scripts/test-e2e.mjs
 *
 * End-to-end test for the two sync directions:
 *  Direction A — OUTBOUND: Book via local site → verify Google Calendar event created
 *  Direction B — INBOUND:  Create Google Calendar event → verify slot blocked on local site
 *
 * Prerequisites:
 *   1. npm run dev is running on localhost:3000
 *   2. GOOGLE_* env vars are set in .env.local
 *   3. POSTGRES_URL is set (for the booking write to DB)
 *
 * Usage:
 *   npm run test-e2e
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

// ── Load .env.local ────────────────────────────────────────────
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

const { google } = require('googleapis');
const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

// ─── Test dates ────────────────────────────────────────────────
// Use the day after tomorrow to avoid hitting real busy slots
const TEST_DATE_OBJ  = new Date(Date.now() + 2 * 86400_000);
const TEST_DATE      = TEST_DATE_OBJ.toISOString().slice(0, 10); // YYYY-MM-DD
const TEST_SLOT      = '02:00 PM';
const TEST_SLOT_HOUR = 14; // 2 PM local → used to build the Calendar event

let passed = 0;
let failed = 0;
const created = { booking: null, calEvent: null }; // for cleanup

function ok(label)            { console.log(`  ✅  ${label}`); passed++; }
function fail(label, reason)  { console.error(`  ❌  ${label}\n       ${reason}`); failed++; }
function info(msg)            { console.log(`  ℹ️  ${msg}`); }
function hr()                 { console.log(`\n${'─'.repeat(56)}`); }

// ── Auth ───────────────────────────────────────────────────────
const { OAuth2 } = google.auth;
const oauthClient = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback'
);
oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const gcal = google.calendar({ version: 'v3', auth: oauthClient });

// ── Utility: get availability for TEST_DATE from local dev ─────
async function getAvailability(label) {
  const url = `${BASE_URL}/api/availability?date=${TEST_DATE}&type=coffee`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Availability API returned ${res.status}`);
  const { slots } = await res.json();
  const slot = slots.find(s => s.time === TEST_SLOT);
  info(`[${label}] ${TEST_SLOT} on ${TEST_DATE} → ${slot?.available ? '🟢 AVAILABLE' : '🔴 BLOCKED'}`);
  return slot?.available;
}

// ── Utility: build start/end ISO strings for the test slot ─────
function buildEventTimes(dateStr, hourLocal, durationMins = 60) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, hourLocal, 0, 0, 0);
  const end   = new Date(start.getTime() + durationMins * 60_000);
  return { startDt: start.toISOString(), endDt: end.toISOString() };
}

// ══════════════════════════════════════════════════════════════
//  DIRECTION A — OUTBOUND: site booking → Google Calendar event
// ══════════════════════════════════════════════════════════════
console.log('\n\n🚀  DIRECTION A — Outbound: Book via site → Google Calendar');
hr();

const BOOKING_DATE = TEST_DATE;
const BOOKING_SLOT = '10:00 AM';

try {
  info(`Posting a test booking to ${BASE_URL}/api/book …`);

  const res = await fetch(`${BASE_URL}/api/book`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type:  'coffee',
      date:  BOOKING_DATE,
      time:  BOOKING_SLOT,
      name:  '[E2E TEST] Auto-created by test-e2e.mjs',
      email: 'test-e2e@delete.me',
      notes: 'Auto-generated test booking — safe to delete',
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    fail('POST /api/book failed', JSON.stringify(data));
  } else {
    ok(`Booking created in DB  (id: ${data.id})`);
    created.booking = data.id;

    // Give Google Calendar a moment to process
    info('Waiting 3 s for Google Calendar event to propagate…');
    await new Promise(r => setTimeout(r, 3000));

    // Search Google Calendar for the event we just created
    const { data: events } = await gcal.events.list({
      calendarId:   'primary',
      timeMin:      new Date(`${BOOKING_DATE}T00:00:00`).toISOString(),
      timeMax:      new Date(`${BOOKING_DATE}T23:59:59`).toISOString(),
      q:            '[E2E TEST]',
      singleEvents: true,
    });

    const match = events.items?.find(e => e.summary?.includes('[E2E TEST]'));
    if (match) {
      ok(`Google Calendar event found: "${match.summary}"`);
      ok(`  Start: ${match.start?.dateTime ?? match.start?.date}`);
      created.calEvent = match.id;            // store for cleanup
    } else {
      fail(
        'Google Calendar event NOT found after booking',
        'Either the Google Calendar write failed or Gmail API scopes are missing.\n' +
        '       Check the terminal running "npm run dev" for [book] or [calendar] errors.'
      );
    }
  }
} catch (err) {
  fail('Direction A threw an exception', err.message);
}

// ══════════════════════════════════════════════════════════════
//  DIRECTION B — INBOUND: Google Calendar event → blocked slot
// ══════════════════════════════════════════════════════════════
console.log('\n\n🚀  DIRECTION B — Inbound: Google Calendar event → site availability');
hr();

let inboundEventId = null;

try {
  // Step 1: confirm the slot is free BEFORE we create the event
  const beforeFree = await getAvailability('before');
  if (beforeFree) {
    ok(`${TEST_SLOT} on ${TEST_DATE} is free before adding the test event`);
  } else {
    info(`${TEST_SLOT} on ${TEST_DATE} is already blocked — test will still run`);
  }

  // Step 2: create a Google Calendar event that covers that slot
  const { startDt, endDt } = buildEventTimes(TEST_DATE, TEST_SLOT_HOUR, 60);
  info(`Creating test Google Calendar event at ${startDt} → ${endDt} …`);

  const { data: created_ev } = await gcal.events.insert({
    calendarId:  'primary',
    requestBody: {
      summary:     '[E2E TEST] Inbound sync test — safe to delete',
      description: 'Auto-generated by test-e2e.mjs — delete if found',
      status:      'confirmed',
      transparency: 'opaque',           // marks slot as "Busy" in freebusy
      start: { dateTime: startDt, timeZone: 'America/Toronto' },
      end:   { dateTime: endDt,   timeZone: 'America/Toronto' },
    },
  });
  inboundEventId = created_ev.id;
  ok(`Google Calendar event created (id: ${inboundEventId})`);

  // Step 3: hit the availability API and confirm the slot is now blocked
  info('Checking availability immediately after creating the event…');
  const afterBlocked = await getAvailability('after create');
  if (afterBlocked === false) {
    ok(`${TEST_SLOT} on ${TEST_DATE} is correctly BLOCKED after adding event`);
  } else {
    fail(
      `${TEST_SLOT} is still showing as AVAILABLE after adding a Google Calendar event`,
      'The availability API may be hitting a stale cache, or GOOGLE_CALENDAR_IDS\n' +
      '       does not include "primary". Check the console output for clues.'
    );
  }

  // Step 4: delete the test event and confirm slot opens up again
  info('Deleting the test Google Calendar event…');
  await gcal.events.delete({ calendarId: 'primary', eventId: inboundEventId });
  inboundEventId = null;
  ok('Test event deleted from Google Calendar');

  info('Checking availability after deleting the event…');
  const afterDelete = await getAvailability('after delete');
  if (afterDelete === true) {
    ok(`${TEST_SLOT} on ${TEST_DATE} is AVAILABLE again after deleting event`);
  } else {
    info(`${TEST_SLOT} still shows BLOCKED after deleting — might be another real event on that day`);
  }

} catch (err) {
  fail('Direction B threw an exception', err.message);
}

// ── Cleanup ────────────────────────────────────────────────────
hr();
console.log('\n🧹  Cleaning up test data…');

if (inboundEventId) {
  try {
    await gcal.events.delete({ calendarId: 'primary', eventId: inboundEventId });
    console.log('  ✅  Deleted leftover inbound test event from Google Calendar');
  } catch { /* already deleted or gone */ }
}

if (created.calEvent) {
  try {
    await gcal.events.delete({ calendarId: 'primary', eventId: created.calEvent });
    console.log('  ✅  Deleted outbound test event from Google Calendar');
  } catch { /* already deleted or gone */ }
}

if (created.booking) {
  console.log(`  ℹ️  Test booking (id: ${created.booking}) left in DB — delete from /admin if needed`);
}

// ── Summary ────────────────────────────────────────────────────
hr();
console.log(`\n  ${passed} passed  |  ${failed} failed`);
if (failed === 0) {
  console.log('\n✅  Full e2e sync test passed!\n');
  process.exit(0);
} else {
  console.error('\n❌  Some checks failed — see above.\n');
  process.exit(1);
}
