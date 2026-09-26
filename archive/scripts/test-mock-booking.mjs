import fs from 'fs';
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

// simulate the function
import { google } from 'googleapis';

function parseDateTimeLocal(dateStr, timeStr) {
  const [time, period] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours  = 0;
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

async function testIt() {
  const { OAuth2 } = google.auth;
  const auth = new OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth });

  const startDt = parseDateTimeLocal('2026-03-07', '09:00 AM');
  const endDt   = new Date(startDt.getTime() + 60 * 60000);
  const ownerEmail = process.env.OWNER_EMAIL ?? 'h.liang@alumni.utoronto.ca';

  const booking = {
    guestName: 'Tina Lin',
    guestEmail: 'linzixin12270921@gmail.com',
    typeLabel: 'Ski Lesson',
    durationMinutes: 60,
    notes: '[Payment: E-Transfer]\n'
  };

  const eventBody = {
    summary: `⛷️ ${booking.typeLabel} — ${booking.guestName}`,
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
    attendees: [{ email: ownerEmail, responseStatus: 'accepted' }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email',  minutes: 60 },
        { method: 'popup',  minutes: 15 },
      ],
    },
    colorId: '1',
  };

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      sendUpdates: 'none', 
    });
    console.log('Event created:', res.data.id);
  } catch (err) {
    console.error('Failed to create event:', err.message);
    console.error(err.response?.data?.error);
  }
}

testIt();
