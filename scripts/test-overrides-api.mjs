/**
 * scripts/test-overrides-api.mjs
 * 
 * Tests the Schedule Overrides API and enforcement logic:
 * 1. blocked slot shown unavailable and rejected by POST /api/book
 * 2. force-opened external-busy slot shown available and accepted
 * 3. force-opened slot with an internal booking still rejected
 * 4. stale client booking against a blocked slot returns 409
 */

import { readFileSync, existsSync } from 'fs';

// Load env
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

const { google } = await import('googleapis');

const BASE = 'http://localhost:3000';
const TEST_EMAIL = 'haodoyoufeeltoday@gmail.com';
const TEST_DATE = '2026-03-19'; // Thursday
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin';

function section(t) { console.log(`\n${'═'.repeat(70)}\n ${t}\n${'═'.repeat(70)}`); }
function ok(m) { console.log(`  ✅ ${m}`); }
function fail(m) { console.log(`  ❌ ${m}`); }

let pass = 0, fails = 0;
function check(c, p, f) { if (c) { ok(p); pass++; } else { fail(f); fails++; } }

let adminCookie;
async function ensureAdmin() {
  if (adminCookie) return;
  const r = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    redirect: 'manual',
  });
  const c = r.headers.getSetCookie?.() || [];
  adminCookie = c.find(x => x.startsWith('admin_session='));
  if (!adminCookie) adminCookie = r.headers.get('set-cookie');
  if (adminCookie) adminCookie = adminCookie.split(';')[0];
  
  if (!adminCookie || !adminCookie.includes('admin_session')) {
    throw new Error('Failed to login as admin: ' + r.status + ' | ' + await r.text());
  }
}

async function setOverride(date, time, action) {
  await ensureAdmin();
  return fetch(`${BASE}/api/admin/overrides`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ date, time, action }),
  });
}

async function removeOverride(date, time) {
  await ensureAdmin();
  return fetch(`${BASE}/api/admin/overrides`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ date, time }),
  });
}

async function deleteBooking(id) {
  await ensureAdmin();
  return (await fetch(`${BASE}/api/admin/stats`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ id, reason: 'E2E test cleanup' }),
  })).json();
}

async function book(type, time, name) {
  return fetch(`${BASE}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, date: TEST_DATE, time, name, email: TEST_EMAIL, notes: 'Override test' }),
  });
}

async function getAvailability(type) {
  const r = await fetch(`${BASE}/api/availability?date=${TEST_DATE}&type=${type}`);
  return r.json();
}

async function createExternalEvent(timeStart, timeEnd) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Convert to mock times in Toronto timezone
    const res = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
            summary: '[TEST] External Block',
            start: { dateTime: `${TEST_DATE}T${timeStart}:00-04:00`, timeZone: 'America/Toronto' },
            end: { dateTime: `${TEST_DATE}T${timeEnd}:00-04:00`, timeZone: 'America/Toronto' },
            reminders: { useDefault: false }
        }
    });
    return res.data.id;
}

async function deleteExternalEvent(id) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    await calendar.events.delete({ calendarId: 'primary', eventId: id });
}

async function run() {
    try {
        // ═══════════════════════════════════════════════════════════════════
        // TEST 1 & 4: blocked slot shown unavailable and rejected by POST /api/book
        //             (stale client booking against a blocked slot returns 409)
        // ═══════════════════════════════════════════════════════════════════
        section("TEST 1 & 4: Blocked slot UI and stale client rejection");
        
        await setOverride(TEST_DATE, '10:00 AM', 'block');
        ok('Set block override on 10:00 AM');

        const avail1 = await getAvailability('coffee');
        const slot1 = avail1.slots?.find(s => s.time === '10:00 AM');
        check(
            slot1 && !slot1.available && slot1.override === 'block',
            'Availability API shows 10:00 AM is unavailable (blocked)',
            `10:00 AM slot state incorrect: ${JSON.stringify(slot1)}`
        );

        const res1 = await book('coffee', '10:00 AM', 'Block Test');
        const data1 = await res1.json();
        check(
            res1.status === 409 && data1.error?.includes('closed by the host'),
            `POST /api/book rejected stale block with 409: "${data1.error}"`,
            `Expected 409, got ${res1.status}: ${JSON.stringify(data1)}`
        );

        await removeOverride(TEST_DATE, '10:00 AM');

        // ═══════════════════════════════════════════════════════════════════
        // TEST 2: force-opened external-busy slot shown available and accepted
        // ═══════════════════════════════════════════════════════════════════
        section("TEST 2: force_open bypasses external Google Calendar events");
        
        // Block 1:00 PM - 2:00 PM context via Google Calendar API directly
        let extEventId;
        try {
            extEventId = await createExternalEvent('13:00', '14:00');
            ok(`Created external Google Calendar block (ID: ${extEventId}) for 1:00 PM`);
            
            // Wait for GCal async propagation (sometimes takes a sec)
            await new Promise(r => setTimeout(r, 2000));

            // Verify Google actually blocks it
            const availExt = await getAvailability('coffee');
            const slot1300 = availExt.slots?.find(s => s.time === '01:00 PM');
            check(
                slot1300 && !slot1300.available,
                'Google Calendar correctly shows 01:00 PM as unavailable initially',
                'Google Calendar did NOT block the slot... test might behave weirdly. State: ' + JSON.stringify(slot1300)
            );

            // Force open the slot
            await setOverride(TEST_DATE, '01:00 PM', 'force_open');
            ok('Set force_open on 01:00 PM');

            // Verify availability API
            const availOpen = await getAvailability('coffee');
            const slot1300Open = availOpen.slots?.find(s => s.time === '01:00 PM');
            check(
                slot1300Open && slot1300Open.available && slot1300Open.override === 'force_open',
                'Availability API shows 01:00 PM is now AVAILABLE (force_open override)',
                `01:00 PM state incorrect: ${JSON.stringify(slot1300Open)}`
            );

            // Attempt to book it
            const resExtBooking = await book('coffee', '01:00 PM', 'Force Open Test');
            const dataExtBooking = await resExtBooking.json();
            
            check(
                resExtBooking.status === 200 && dataExtBooking.success,
                `POST /api/book successfully booked the force-opened slot (ID: ${dataExtBooking.id})`,
                `Failed to book force-opened slot: ${JSON.stringify(dataExtBooking)}`
            );

            // Cleanup
            if (dataExtBooking.id) {
                await deleteBooking(dataExtBooking.id);
            }
        } finally {
            if (extEventId) {
                await deleteExternalEvent(extEventId);
                ok('Cleaned up external Google Calendar event');
            }
            await removeOverride(TEST_DATE, '01:00 PM');
        }

        // ═══════════════════════════════════════════════════════════════════
        // TEST 3: force-opened slot with an internal booking still rejected
        // ═══════════════════════════════════════════════════════════════════
        section("TEST 3: force_open respects internal bookings (range overlap)");

        // Book 02:00 PM to 03:00 PM (1 hour in person)
        const resInternal = await book('in_person', '02:00 PM', 'Internal Range Test');
        const dataInternal = await resInternal.json();
        
        if (dataInternal.success) {
            ok(`Created internal booking at 02:00 PM for 60 min (ID: ${dataInternal.id})`);
            
            // Try to force open 02:30 PM
            await setOverride(TEST_DATE, '02:30 PM', 'force_open');
            
            const availInt = await getAvailability('coffee');
            const slot1430 = availInt.slots?.find(s => s.time === '02:30 PM');
            
            check(
                slot1430 && !slot1430.available && slot1430.override === 'force_open',
                'Availability API keeps 02:30 PM UNAVAILABLE (internal overlap with 02:00 booking)',
                `Slot wrongly opened: ${JSON.stringify(slot1430)}`
            );
            
            const resFailBooking = await book('coffee', '02:30 PM', 'Stale overlap');
            check(
                resFailBooking.status === 409,
                'POST /api/book correctly REJECTS booking overlapping 02:00 PM with 409 Conflict',
                'POST /api/book wrongly accepted an overlapping force_open booking'
            );

            // Cleanup
            await removeOverride(TEST_DATE, '02:30 PM');
            await deleteBooking(dataInternal.id);
        } else {
            fail("Failed to setup internal booking test: " + JSON.stringify(dataInternal));
        }

        section('SUMMARY');
        console.log(`  Results: ${pass} passed, ${fails} failed\n`);
        if (fails === 0) console.log('  🎉 ALL OVERRIDES API TESTS PASSED!');
        else process.exit(1);

    } catch(e) {
        console.error("FATAL ERROR", e);
    }
}

run();
