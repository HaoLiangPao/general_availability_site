/**
 * lib/calendar.ts
 * Fetches busy/free slots from Google Calendar (OAuth2) and 
 * optionally from an Outlook iCal feed URL.
 *
 * Returns an array of ISO date-time strings that are BUSY.
 */

import { google } from 'googleapis';

export interface BusyInterval {
  start: string;
  end: string;
}

/** Build an authenticated Google OAuth2 client from env vars */
function getGoogleOAuth2Client() {
  const { OAuth2 } = google.auth;
  const client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

/**
 * Returns busy intervals for the next `days` days from Google Calendar.
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
 */
export async function getGoogleBusySlots(days = 14): Promise<BusyInterval[]> {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    console.warn('[calendar] GOOGLE_REFRESH_TOKEN not set – skipping Google Calendar sync');
    return [];
  }

  const auth = getGoogleOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400_000).toISOString();

  const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary')
    .split(',')
    .map(id => id.trim());

  const items = calendarIds.map(id => ({ id }));

  try {
    const { data } = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items }
    });

    const busy: BusyInterval[] = [];
    for (const cal of Object.values(data.calendars ?? {})) {
      for (const slot of cal.busy ?? []) {
        if (slot.start && slot.end) {
          busy.push({ start: slot.start, end: slot.end });
        }
      }
    }
    return busy;
  } catch (err) {
    console.error('[calendar] Google freebusy error:', err);
    return [];
  }
}

/**
 * Parses an iCal (.ics) feed URL and returns busy intervals for the next `days` days.
 * Works for Outlook "Publish calendar" ICS links.
 */
export async function getOutlookBusySlots(days = 14): Promise<BusyInterval[]> {
  const icsUrl = process.env.OUTLOOK_ICAL_URL;
  if (!icsUrl) {
    console.warn('[calendar] OUTLOOK_ICAL_URL not set – skipping Outlook sync');
    return [];
  }

  try {
    const res = await fetch(icsUrl, { next: { revalidate: 0 } });
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

/** Minimal iCal parser – extracts DTSTART / DTEND pairs */
function parseIcsBusy(icsText: string, days: number): BusyInterval[] {
  const now = Date.now();
  const maxTs = now + days * 86400_000;
  const busy: BusyInterval[] = [];
  const events = icsText.split('BEGIN:VEVENT');

  for (let i = 1; i < events.length; i++) {
    const block = events[i];
    const startMatch = block.match(/DTSTART[^:]*:(\S+)/);
    const endMatch   = block.match(/DTEND[^:]*:(\S+)/);
    if (!startMatch || !endMatch) continue;

    const start = parseIcsDate(startMatch[1]);
    const end   = parseIcsDate(endMatch[1]);
    if (!start || !end) continue;
    if (start.getTime() > maxTs || end.getTime() < now) continue;

    busy.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return busy;
}

function parseIcsDate(raw: string): Date | null {
  // Handles: 20260302T170000Z  or  20260302T170000  or  20260302
  const clean = raw.trim().replace(/Z$/, '');
  if (clean.length === 8) {
    // All-day: 20260302
    return new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`);
  }
  if (clean.length >= 15) {
    return new Date(
      `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`
    );
  }
  return null;
}

/**
 * Merge and deduplicate busy intervals from all calendar sources.
 */
export async function getAllBusySlots(days = 14): Promise<BusyInterval[]> {
  const [google, outlook] = await Promise.all([
    getGoogleBusySlots(days),
    getOutlookBusySlots(days),
  ]);
  return [...google, ...outlook];
}

/**
 * Given a date and a list of candidate time strings (e.g. "09:00 AM"),
 * returns which slots are NOT overlapped by any busy interval.
 */
export function filterAvailableSlots(
  dateStr: string,         // e.g. "2026-03-04"
  candidates: string[],   // e.g. ["09:00 AM", "09:30 AM", ...]
  durationMinutes: number,
  busy: BusyInterval[]
): { time: string; available: boolean }[] {
  return candidates.map(timeStr => {
    const slotStart = parseDateTimeLocal(dateStr, timeStr);
    const slotEnd   = new Date(slotStart.getTime() + durationMinutes * 60_000);

    const blocked = busy.some(b => {
      const bStart = new Date(b.start);
      const bEnd   = new Date(b.end);
      // Overlap if slotStart < bEnd AND slotEnd > bStart
      return slotStart < bEnd && slotEnd > bStart;
    });

    return { time: timeStr, available: !blocked };
  });
}

function parseDateTimeLocal(dateStr: string, timeStr: string): Date {
  // e.g. dateStr = "2026-03-04", timeStr = "09:00 AM"
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  const d = new Date(dateStr);
  d.setHours(hours, minutes, 0, 0);
  return d;
}
