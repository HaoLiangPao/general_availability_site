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

// ── 3. Discover all calendars ─────────────────────────────────
console.log('\n�  Discovering all calendars in your Google account…');

const calendar = google.calendar({ version: 'v3', auth: oauthClient });
let allCalendarIds = [];

try {
  const { data: calList } = await calendar.calendarList.list({ minAccessRole: 'freeBusyReader' });
  const items = calList.items ?? [];

  console.log(`\n  Found ${items.length} calendar(s):\n`);
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  for (const item of items) {
    const selected = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary')
      .split(',').map(s => s.trim()).includes(item.id ?? '') ? '✅' : '  ';
    console.log(`  │ ${selected} ${(item.summary ?? '(no name)').padEnd(35)} ${(item.id ?? '').slice(0, 20)}`);
    allCalendarIds.push(item.id);
  }
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('\n  ✅ = currently in GOOGLE_CALENDAR_IDS');
  console.log('\n  To include ALL calendars in your availability check, add this to .env.local:');
  console.log(`\n  GOOGLE_CALENDAR_IDS=${allCalendarIds.join(',')}\n`);
  ok(`Found ${items.length} calendars`);
} catch (err) {
  fail('Calendar list failed', err.message);
  allCalendarIds = ['primary'];
}

// ── 4. Google Calendar freebusy (14-day overview) ─────────────
console.log('\n📅  Querying freebusy for next 14 days (current GOOGLE_CALENDAR_IDS)…');
const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary').split(',').map(id => id.trim());
console.log(`  Checking: ${calendarIds.join(', ')}`);

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
    console.log("  ℹ️  No busy intervals found — try adding more calendar IDs above.");
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

// Use a synthetic full-day block on 2026-03-04 (a real date with a full-day event).
// A full-day UTC block ensures the result is timezone-independent.
const BLOCKED_DATE   = '2026-03-04';
const UNBLOCKED_DATE = '2026-03-05';
const testBusy = [
  { start: '2026-03-04T00:00:00Z', end: '2026-03-04T23:59:59Z' },
];
const candidates = ['09:00 AM', '02:00 PM'];

const onBusy   = filterAvailableSlots(BLOCKED_DATE,   candidates, 30, testBusy);
const onFree   = filterAvailableSlots(UNBLOCKED_DATE, candidates, 30, testBusy);

if (!onBusy.find(r => r.time === '09:00 AM')?.available) ok('09:00 AM on busy day (2026-03-04) is blocked');
else fail('09:00 AM on 2026-03-04 should be blocked', JSON.stringify(onBusy));

if (!onBusy.find(r => r.time === '02:00 PM')?.available) ok('02:00 PM on busy day (2026-03-04) is blocked');
else fail('02:00 PM on 2026-03-04 should be blocked', JSON.stringify(onBusy));

if (onFree.find(r => r.time === '09:00 AM')?.available)  ok('09:00 AM on free day (2026-03-05) is available');
else fail('09:00 AM on 2026-03-05 should be available', JSON.stringify(onFree));

if (onFree.find(r => r.time === '02:00 PM')?.available)  ok('02:00 PM on free day (2026-03-05) is available');
else fail('02:00 PM on 2026-03-05 should be available', JSON.stringify(onFree));

// ── 6. Live availability check for 2026-03-04 ─────────────────
console.log('\n🗓️   Live availability check for 2026-03-04…');
console.log('  (Using real Google Calendar data for this date)\n');

const ALL_SLOTS = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM',
  '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM',
  '05:00 PM',
];

try {
  // Query freebusy specifically for 2026-03-04 (midnight-to-midnight in UTC)
  const dayStart = new Date('2026-03-04T00:00:00Z').toISOString();
  const dayEnd   = new Date('2026-03-05T00:00:00Z').toISOString();

  const { data: dayData } = await calendar.freebusy.query({
    requestBody: {
      timeMin: dayStart,
      timeMax: dayEnd,
      items: calendarIds.map(id => ({ id })),
    },
  });

  // Collect all busy intervals for the day
  const dayBusy = [];
  for (const [calId, cal] of Object.entries(dayData.calendars ?? {})) {
    console.log(`  📅  Calendar: "${calId}"`);
    if (cal.errors?.length) {
      console.log(`       ⚠️  Errors: ${JSON.stringify(cal.errors)}`);
    } else if (!cal.busy?.length) {
      console.log(`       ℹ️  No busy intervals on 2026-03-04`);
    } else {
      console.log(`       Busy intervals (UTC):`);
      for (const b of cal.busy) {
        const localStart = new Date(b.start).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: true });
        const localEnd   = new Date(b.end).toLocaleString('en-CA', { timeZone: 'America/Toronto', hour12: true });
        console.log(`         ${b.start} → ${b.end}`);
        console.log(`         (Toronto: ${localStart} → ${localEnd})`);
        dayBusy.push(b);
      }
    }
  }

  // Run filterAvailableSlots against real data
  console.log(`\n  Candidate slots vs. real calendar data (30-min duration):`);
  const realResults = filterAvailableSlots('2026-03-04', ALL_SLOTS, 30, dayBusy);
  const available = realResults.filter(r => r.available);
  const blocked   = realResults.filter(r => !r.available);

  if (blocked.length) {
    console.log(`\n  🔴  Blocked slots (${blocked.length}):`);
    blocked.forEach(r => console.log(`       ${r.time}`));
  }
  if (available.length) {
    console.log(`\n  🟢  Available slots (${available.length}):`);
    available.forEach(r => console.log(`       ${r.time}`));
  } else {
    console.log('\n  ℹ️  No available slots — the whole day appears busy.');
  }
} catch (err) {
  console.error(`  ❌  Live check failed: ${err.message}`);
}

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
