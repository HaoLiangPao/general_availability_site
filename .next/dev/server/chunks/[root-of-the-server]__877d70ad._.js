module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/child_process [external] (child_process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("child_process", () => require("child_process"));

module.exports = mod;
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/https [external] (https, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("https", () => require("https"));

module.exports = mod;
}),
"[externals]/stream [external] (stream, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("stream", () => require("stream"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[externals]/events [external] (events, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("events", () => require("events"));

module.exports = mod;
}),
"[externals]/process [external] (process, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("process", () => require("process"));

module.exports = mod;
}),
"[externals]/util [external] (util, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("util", () => require("util"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/querystring [external] (querystring, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("querystring", () => require("querystring"));

module.exports = mod;
}),
"[externals]/buffer [external] (buffer, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("buffer", () => require("buffer"));

module.exports = mod;
}),
"[externals]/http2 [external] (http2, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("http2", () => require("http2"));

module.exports = mod;
}),
"[externals]/zlib [external] (zlib, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("zlib", () => require("zlib"));

module.exports = mod;
}),
"[externals]/url [external] (url, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("url", () => require("url"));

module.exports = mod;
}),
"[project]/src/lib/calendar.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "filterAvailableSlots",
    ()=>filterAvailableSlots,
    "getAllBusySlots",
    ()=>getAllBusySlots,
    "getGoogleBusySlots",
    ()=>getGoogleBusySlots,
    "getOutlookBusySlots",
    ()=>getOutlookBusySlots
]);
/**
 * lib/calendar.ts
 * Fetches busy/free slots from Google Calendar (OAuth2) and 
 * optionally from an Outlook iCal feed URL.
 *
 * Returns an array of ISO date-time strings that are BUSY.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$googleapis$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/googleapis/build/src/index.js [app-route] (ecmascript)");
;
/** Build an authenticated Google OAuth2 client from env vars */ function getGoogleOAuth2Client() {
    const { OAuth2 } = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$googleapis$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["google"].auth;
    const client = new OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
    if (process.env.GOOGLE_REFRESH_TOKEN) {
        client.setCredentials({
            refresh_token: process.env.GOOGLE_REFRESH_TOKEN
        });
    }
    return client;
}
async function getGoogleBusySlots(days = 14) {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        console.warn('[calendar] GOOGLE_REFRESH_TOKEN not set – skipping Google Calendar sync');
        return [];
    }
    const auth = getGoogleOAuth2Client();
    const calendar = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$googleapis$2f$build$2f$src$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["google"].calendar({
        version: 'v3',
        auth
    });
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + days * 86400_000).toISOString();
    const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary').split(',').map((id)=>id.trim());
    const items = calendarIds.map((id)=>({
            id
        }));
    try {
        const { data } = await calendar.freebusy.query({
            requestBody: {
                timeMin,
                timeMax,
                items
            }
        });
        const busy = [];
        for (const cal of Object.values(data.calendars ?? {})){
            for (const slot of cal.busy ?? []){
                if (slot.start && slot.end) {
                    busy.push({
                        start: slot.start,
                        end: slot.end
                    });
                }
            }
        }
        return busy;
    } catch (err) {
        console.error('[calendar] Google freebusy error:', err);
        return [];
    }
}
async function getOutlookBusySlots(days = 14) {
    const icsUrl = process.env.OUTLOOK_ICAL_URL;
    if (!icsUrl) {
        console.warn('[calendar] OUTLOOK_ICAL_URL not set – skipping Outlook sync');
        return [];
    }
    try {
        const res = await fetch(icsUrl, {
            next: {
                revalidate: 0
            }
        });
        if (!res.ok) {
            console.error('[calendar] Failed to fetch iCal feed:', res.status);
            return [];
        }
        const text = await res.text();
        return parseIcsBusy(text, days);
    } catch (err) {
        console.error('[calendar] Outlook iCal error:', err);
        return [];
    }
}
/** Minimal iCal parser – extracts DTSTART / DTEND pairs */ function parseIcsBusy(icsText, days) {
    const now = Date.now();
    const maxTs = now + days * 86400_000;
    const busy = [];
    const events = icsText.split('BEGIN:VEVENT');
    for(let i = 1; i < events.length; i++){
        const block = events[i];
        const startMatch = block.match(/DTSTART[^:]*:(\S+)/);
        const endMatch = block.match(/DTEND[^:]*:(\S+)/);
        if (!startMatch || !endMatch) continue;
        const start = parseIcsDate(startMatch[1]);
        const end = parseIcsDate(endMatch[1]);
        if (!start || !end) continue;
        if (start.getTime() > maxTs || end.getTime() < now) continue;
        busy.push({
            start: start.toISOString(),
            end: end.toISOString()
        });
    }
    return busy;
}
function parseIcsDate(raw) {
    // Handles: 20260302T170000Z  or  20260302T170000  or  20260302
    const clean = raw.trim().replace(/Z$/, '');
    if (clean.length === 8) {
        // All-day: 20260302
        return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`);
    }
    if (clean.length >= 15) {
        return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`);
    }
    return null;
}
async function getAllBusySlots(days = 14) {
    const [google, outlook] = await Promise.all([
        getGoogleBusySlots(days),
        getOutlookBusySlots(days)
    ]);
    return [
        ...google,
        ...outlook
    ];
}
function filterAvailableSlots(dateStr, candidates, durationMinutes, busy) {
    return candidates.map((timeStr)=>{
        const slotStart = parseDateTimeLocal(dateStr, timeStr);
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
        const blocked = busy.some((b)=>{
            const bStart = new Date(b.start);
            const bEnd = new Date(b.end);
            // Overlap if slotStart < bEnd AND slotEnd > bStart
            return slotStart < bEnd && slotEnd > bStart;
        });
        return {
            time: timeStr,
            available: !blocked
        };
    });
}
function parseDateTimeLocal(dateStr, timeStr) {
    // e.g. dateStr = "2026-03-04", timeStr = "09:00 AM"
    const [time, period] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const d = new Date(dateStr);
    d.setHours(hours, minutes, 0, 0);
    return d;
}
}),
"[project]/src/app/api/availability/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/calendar.ts [app-route] (ecmascript)");
;
;
// Candidate times shown on the booking page
const CANDIDATE_TIMES = [
    '09:00 AM',
    '09:30 AM',
    '10:00 AM',
    '10:30 AM',
    '11:00 AM',
    '11:30 AM',
    '01:00 PM',
    '01:30 PM',
    '02:00 PM',
    '02:30 PM',
    '03:00 PM',
    '03:30 PM',
    '04:00 PM',
    '04:30 PM'
];
const DURATION = {
    interview: 45,
    coffee: 30,
    in_person: 60
};
async function GET(req) {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date'); // e.g. 2026-03-04
    const type = searchParams.get('type') ?? 'interview';
    if (!date) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'date param required'
        }, {
            status: 400
        });
    }
    const busy = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getAllBusySlots"])(30);
    const duration = DURATION[type] ?? 45;
    const slots = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$calendar$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["filterAvailableSlots"])(date, CANDIDATE_TIMES, duration, busy);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        slots,
        lastSynced: new Date().toISOString()
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__877d70ad._.js.map