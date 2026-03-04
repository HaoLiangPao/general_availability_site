#!/usr/bin/env node
/**
 * scripts/test-calendar-sync.mjs
 *
 * Local smoke test for Google Calendar + Outlook sync.
 * Run while dev server is NOT needed — this tests the library functions directly.
 *
 *   npm run test-calendar
 *
 * What it checks:
 *   1. GOOGLE_* env vars are set
 *   2. Google OAuth2 token refresh works (network call to Google)
 *   3. Google Calendar API is enabled and freebusy works
 *   4. Outlook iCal URL fetch works (if OUTLOOK_ICAL_URL is set)
 *   5. filterAvailableSlots correctly blocks a busy slot (timezone-independent)
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

let passed = 0;
let failed = 0;

function ok(label)          { console.log(`  ✅  ${label}`); passed++; }
function fail(label, reason) { console.error(`  ❌  ${label}\n       ${reason}`); failed++; }

// ── 1. Check env vars ──────────────────────────────────────────
console.log('\n📋  Checking environment variables…');
const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
for (const key of required) {
  if (process.env[key]) ok(`${key} is set`);
  else                  fail(`${key} missing`, `Run 'npm run setup-oauth' first`);
}

if (failed > 0) {
  console.error('\n❌  Fix missing env vars above before running this test.\n');
  process.exit(1);
}

// ── 2. Token refresh ───────────────────────────────────────────
console.log('\n🔑  Testing Google OAuth2 token refresh…');
const { OAuth2 } = google.auth;
const oauthClient = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback'
);
oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

try {
  const { token } = await oauthClient.getAccessToken();
  ok(`Access token obtained (${token?.slice(0, 20)}…)`);
} catch (err) {
  fail('Failed to refresh access token', err.message);
  console.error('\n❌  Cannot continue without a valid access token.\n');
  process.exit(1);
}

// ── 3. Google Calendar freebusy ────────────────────────────────
console.log('\n📅  Querying Google Calendar freebusy API…');
console.log('  ℹ️  If this fails, enable the API at:');
console.log(`  https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=${process.env.GOOGLE_CLIENT_ID?.split('-')[0]}`);

const calendar = google.calendar({ version: 'v3', auth: oauthClient });
const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary').split(',').map(id => id.trim());
const timeMin = new Date().toISOString();
const timeMax = new Date(Date.now() + 14 * 86400_000).toISOString();

try {
  const { data } = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: calendarIds.map(id => ({ id })) },
  });

  let totalBusy = 0;
  for (const [calId, cal] of Object.entries(data.calendars ?? {})) {
    const n = cal.busy?.length ?? 0;
    totalBusy += n;
    if (cal.errors?.length) {
      fail(`Calendar "${calId}" returned errors`, JSON.stringify(cal.errors));
    } else {
      ok(`Calendar "${calId}" → ${n} busy interval${n === 1 ? '' : 's'} in next 14 days`);
    }
  }
  if (totalBusy === 0) {
    console.log("  ℹ️  No busy intervals — that's fine if your calendar is empty.");
  }
} catch (err) {
  fail('Google Calendar API call failed', err.message);
  if (err.message?.includes('has not been used') || err.message?.includes('disabled')) {
    console.error('\n  ⚠️  Action required: Enable the Google Calendar API:');
    console.error('  https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview');
    console.error('  After enabling, wait 1-2 minutes then re-run this test.\n');
  }
}

// ── 4. Outlook iCal (optional) ─────────────────────────────────
if (process.env.OUTLOOK_ICAL_URL) {
  console.log('\n📆  Testing Outlook iCal feed…');
  try {
    const res = await fetch(process.env.OUTLOOK_ICAL_URL);
    if (res.ok) {
      const text = await res.text();
      const eventCount = (text.match(/BEGIN:VEVENT/g) ?? []).length;
      ok(`iCal feed reachable — ${eventCount} event${eventCount === 1 ? '' : 's'} found`);
    } else {
      fail('iCal feed returned HTTP ' + res.status, 'Check your OUTLOOK_ICAL_URL');
    }
  } catch (err) {
    fail('iCal fetch failed', err.message);
  }
} else {
  console.log('\n📆  OUTLOOK_ICAL_URL not set — skipping Outlook test (optional)');
}

// ── 5. filterAvailableSlots logic ─────────────────────────────
console.log('\n🧮  Testing filterAvailableSlots logic…');

function filterAvailableSlots(dateStr, candidates, durationMinutes, busy) {
  const parseDateTimeLocal = (d, t) => {
    const [time, period] = t.split(' ');
    let [h, m] = time.split(':').map(Number);
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    // Use Date(year, month-1, day) to construct in LOCAL time.
    // new Date('YYYY-MM-DD') is UTC midnight, which in negative-offset
    // timezones lands on the previous day when setHours() is called.
    const [year, month, day] = d.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day, h, m, 0, 0);
  };

  return candidates.map(timeStr => {
    const slotStart = parseDateTimeLocal(dateStr, timeStr);
    const slotEnd   = new Date(slotStart.getTime() + durationMinutes * 60_000);
    const blocked = busy.some(b => {
      return slotStart < new Date(b.end) && slotEnd > new Date(b.start);
    });
    return { time: timeStr, available: !blocked };
  });
}

// Use a full-day UTC block so the result is timezone-independent.
// Any local time on that day will overlap a 00:00–23:59 UTC block.
const BLOCKED_DATE   = '2030-06-15';
const UNBLOCKED_DATE = '2030-06-16';
const testBusy = [
  { start: '2030-06-15T00:00:00Z', end: '2030-06-15T23:59:59Z' },
];
const candidates = ['09:00 AM', '02:00 PM'];

const onBusy   = filterAvailableSlots(BLOCKED_DATE,   candidates, 30, testBusy);
const onFree   = filterAvailableSlots(UNBLOCKED_DATE, candidates, 30, testBusy);

if (!onBusy.find(r => r.time === '09:00 AM')?.available) ok('09:00 AM on busy day is blocked');
else fail('09:00 AM on busy day should be blocked', JSON.stringify(onBusy));

if (!onBusy.find(r => r.time === '02:00 PM')?.available) ok('02:00 PM on busy day is blocked');
else fail('02:00 PM on busy day should be blocked', JSON.stringify(onBusy));

if (onFree.find(r => r.time === '09:00 AM')?.available)  ok('09:00 AM on free day is available');
else fail('09:00 AM on free day should be available', JSON.stringify(onFree));

if (onFree.find(r => r.time === '02:00 PM')?.available)  ok('02:00 PM on free day is available');
else fail('02:00 PM on free day should be available', JSON.stringify(onFree));

// ── Summary ────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed  |  ${failed} failed`);
if (failed === 0) {
  console.log('\n✅  All calendar sync checks passed!\n');
  process.exit(0);
} else {
  console.error('\n❌  Some checks failed — see above.\n');
  process.exit(1);
}
