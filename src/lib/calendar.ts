/**
 * lib/calendar.ts
 *
 * Two responsibilities:
 *  1. READ busy/free slots from Google Calendar (freebusy API) + Outlook iCal feeds
 *  2. WRITE new events to Google Calendar when a booking is confirmed
 *     and send a notification email to the owner via Gmail API
 *
 * Auth model:
 *  - One-time OAuth2 flow (run `npm run setup-oauth`) generates a refresh_token
 *  - Store GOOGLE_REFRESH_TOKEN in .env.local (local) or your hosting platform's secrets
 *  - At runtime the app exchanges the refresh_token for short-lived access_tokens
 *    → no redirect / callback needed at runtime, only during initial setup
 */

import { google } from 'googleapis';

export interface BusyInterval {
  start: string;
  end: string;
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

export function getGoogleOAuth2Client() {
  const { OAuth2 } = google.auth;
  const client = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI   // only needed during initial setup, not at runtime
  );
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  }
  return client;
}

function isGoogleConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

// ─── READ: busy slots ─────────────────────────────────────────────────────────

/**
 * Returns busy intervals from Google Calendar for the next `days` days.
 */
export async function getGoogleBusySlots(days = 14): Promise<BusyInterval[]> {
  if (!isGoogleConfigured()) {
    console.warn('[calendar] Google credentials not fully set — skipping Google Calendar sync');
    return [];
  }

  const auth = getGoogleOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400_000).toISOString();
  const calendarIds = (process.env.GOOGLE_CALENDAR_IDS ?? 'primary')
    .split(',')
    .map(id => id.trim());

  try {
    const { data } = await calendar.freebusy.query({
      requestBody: { timeMin, timeMax, items: calendarIds.map(id => ({ id })) }
    });

    const busy: BusyInterval[] = [];
    for (const cal of Object.values(data.calendars ?? {})) {
      for (const slot of cal.busy ?? []) {
        if (slot.start && slot.end) busy.push({ start: slot.start, end: slot.end });
      }
    }
    return busy;
  } catch (err) {
    console.error('[calendar] Google freebusy error:', err);
    return [];
  }
}

/**
 * Parses an Outlook iCal feed URL and returns busy intervals for the next `days` days.
 * Get the URL from Outlook.com → Settings → Calendar → Shared Calendars → Publish → ICS link
 */
export async function getOutlookBusySlots(days = 14): Promise<BusyInterval[]> {
  const icsUrl = process.env.OUTLOOK_ICAL_URL;
  if (!icsUrl) {
    console.warn('[calendar] OUTLOOK_ICAL_URL not set — skipping Outlook sync');
    return [];
  }

  try {
    const res = await fetch(icsUrl, { cache: 'no-store' });
    if (!res.ok) { console.error('[calendar] iCal fetch failed:', res.status); return []; }
    return parseIcsBusy(await res.text(), days);
  } catch (err) {
    console.error('[calendar] Outlook iCal error:', err);
    return [];
  }
}

/** Minimal iCal parser — extracts DTSTART / DTEND pairs */
function parseIcsBusy(icsText: string, days: number): BusyInterval[] {
  const now = Date.now();
  const maxTs = now + days * 86400_000;
  const busy: BusyInterval[] = [];

  for (const block of icsText.split('BEGIN:VEVENT').slice(1)) {
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
  const clean = raw.trim().replace(/Z$/, '');
  if (clean.length === 8)
    return new Date(`${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}`);
  if (clean.length >= 15)
    return new Date(`${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T${clean.slice(9,11)}:${clean.slice(11,13)}:${clean.slice(13,15)}Z`);
  return null;
}

export async function getAllBusySlots(days = 14): Promise<BusyInterval[]> {
  const [googleSlots, outlookSlots] = await Promise.all([
    getGoogleBusySlots(days),
    getOutlookBusySlots(days),
  ]);
  return [...googleSlots, ...outlookSlots];
}

/**
 * Given a date string and list of candidate times, returns which are free.
 */
export function filterAvailableSlots(
  dateStr: string,
  candidates: string[],
  durationMinutes: number,
  busy: BusyInterval[]
): { time: string; available: boolean }[] {
  return candidates.map(timeStr => {
    const slotStart = parseDateTimeLocal(dateStr, timeStr);
    const slotEnd   = new Date(slotStart.getTime() + durationMinutes * 60_000);
    const blocked = busy.some(b => {
      const bStart = new Date(b.start);
      const bEnd   = new Date(b.end);
      return slotStart < bEnd && slotEnd > bStart;
    });
    return { time: timeStr, available: !blocked };
  });
}

function parseDateTimeLocal(dateStr: string, timeStr: string): Date {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours  = 0;
  // Use Date(year, month-1, day) so the date is constructed in LOCAL time.
  // new Date('YYYY-MM-DD') creates UTC midnight, which lands on the previous
  // day for UTC-negative timezones when setHours() is called.
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}


// ─── WRITE: create calendar event + notify owner ──────────────────────────────

export interface BookingDetails {
  type: string;         // 'interview' | 'coffee' | 'in_person'
  typeLabel: string;    // human-readable label
  date: string;         // ISO date "2026-03-10"
  time: string;         // "09:30 AM"
  durationMinutes: number;
  guestName: string;
  guestEmail: string;
  notes: string;
  confirmLink?: string;
}

/**
 * Creates a Google Calendar event on the owner's primary calendar and
 * sends a notification email to OWNER_EMAIL (defaults to h.liang@alumni.utoronto.ca).
 *
 * The guest (booker) is NOT sent a calendar invite — they only get the
 * confirmation shown in the UI. Only the owner gets the calendar block.
 */
export async function createBookingEvent(booking: BookingDetails): Promise<{ eventId?: string; error?: string }> {
  if (!isGoogleConfigured()) {
    console.warn('[calendar] Google credentials not set — skipping calendar event creation');
    return { error: 'Google Calendar not configured' };
  }

  const auth = getGoogleOAuth2Client();
  const calendar = google.calendar({ version: 'v3', auth });

  const startDt = parseDateTimeLocal(booking.date, booking.time);
  const endDt   = new Date(startDt.getTime() + booking.durationMinutes * 60_000);

  const ownerEmail = process.env.OWNER_EMAIL ?? 'h.liang@alumni.utoronto.ca';

  const eventBody = {
    summary: `${bookingIcon(booking.type)} ${booking.typeLabel} — ${booking.guestName}`,
    description: [
      `Booked via availability site`,
      ``,
      `Guest: ${booking.guestName} <${booking.guestEmail}>`,
      `Type:  ${booking.typeLabel}`,
      `Duration: ${booking.durationMinutes} min`,
      booking.notes ? `\nNotes from guest:\n${booking.notes}` : '',
    ].join('\n'),
    start: { dateTime: startDt.toISOString(), timeZone: 'America/New_York' },
    end:   { dateTime: endDt.toISOString(),   timeZone: 'America/New_York' },
    // Attendees list only contains the owner — guest is NOT invited automatically
    attendees: [{ email: ownerEmail, responseStatus: 'accepted' }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 60 },
        { method: 'popup',  minutes: 15 },
      ],
    },
    colorId: colorId(booking.type),
  };

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      sendUpdates: 'none',   // don't auto-email guests from Google
    });
    const eventId = res.data.id ?? undefined;

    // Also send a plain notification email to yourself via Gmail API
    await sendOwnerNotificationEmail(auth, booking, ownerEmail);

    return { eventId };
  } catch (err: unknown) {
    console.error('[calendar] Event creation error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

function bookingIcon(type: string): string {
  return { interview: '💼', coffee: '☕', in_person: '🤝' }[type] ?? '📅';
}

function colorId(type: string): string {
  // Google Calendar color IDs: 9=blueberry, 3=grape, 2=sage
  return { interview: '9', coffee: '3', in_person: '2' }[type] ?? '1';
}

// ─── Gmail notification to owner ─────────────────────────────────────────────

async function sendOwnerNotificationEmail(
  auth: ReturnType<typeof getGoogleOAuth2Client>,
  booking: BookingDetails,
  ownerEmail: string
) {
  const gmail = google.gmail({ version: 'v1', auth });

  const subject = `New booking: ${booking.typeLabel} with ${booking.guestName} on ${booking.date} at ${booking.time}`;
  const body = [
    `Hi Hao,`,
    ``,
    `Someone just booked a time with you on your availability site.`,
    ``,
    `─────────────────────────────────`,
    ` Type:     ${booking.typeLabel}`,
    ` Date:     ${booking.date}`,
    ` Time:     ${booking.time} (${booking.durationMinutes} min)`,
    ` Guest:    ${booking.guestName}`,
    ` Email:    ${booking.guestEmail}`,
    booking.notes ? ` Notes:    ${booking.notes}` : '',
    `─────────────────────────────────`,
    ``,
    booking.confirmLink ? `*** IMMEDIATE ACTION REQUIRED ***\nTo confirm this interview, click here:\n${booking.confirmLink}\n\n` : '',
    `A calendar event has been added to your Google Calendar.`,
    ``,
    `— Your Availability Site`,
  ].filter(l => l !== undefined).join('\n');

  // RFC 2822 raw message
  const rawMessage = [
    `From: ${ownerEmail}`,
    `To: ${ownerEmail}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ].join('\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
  } catch (err) {
    // Non-fatal — the calendar event is already created
    console.error('[gmail] Failed to send notification email:', err);
  }
}
