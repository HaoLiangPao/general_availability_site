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

import { google } from 'googleapis';

const { OAuth2 } = google.auth;
const client = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: client });
const gmail = google.gmail({ version: 'v1', auth: client });

async function createBooking() {
  const startDt = new Date();
  startDt.setHours(startDt.getHours() + 24); // Tomorrow
  const endDt = new Date(startDt.getTime() + 60 * 60000);

  const eventBody = {
    summary: `☕ Coffee Chat — Test User`,
    description: `Booked via availability site`,
    start: { dateTime: startDt.toISOString(), timeZone: 'America/New_York' },
    end:   { dateTime: endDt.toISOString(),   timeZone: 'America/New_York' },
    attendees: [{ email: process.env.OWNER_EMAIL, responseStatus: 'accepted' }],
    colorId: '3',
  };

  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      sendUpdates: 'none',
    });
    console.log('Event created with ID:', res.data.id);
  } catch (err) {
    console.error('Failed to create event:', err.message);
    console.error(err.response?.data?.error);
  }
}

createBooking();
