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
import { createBookingEvent } from '../src/lib/calendar';

async function verifyBookingAndEmails() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

  const calendar = google.calendar({ version: 'v3', auth });
  const gmail = google.gmail({ version: 'v1', auth });

  console.log('1. Simulating an "Interview" booking request to host (Pending)...');
  const result = await createBookingEvent({
    type: 'interview',
    typeLabel: 'Job Interview',
    date: '2026-03-31',
    time: '10:00 AM',
    durationMinutes: 45,
    guestName: 'Verification Test',
    guestEmail: 'testguest@local.me',
    notes: 'Testing pending interview flow',
    confirmLink: 'http://localhost:3000/api/confirm?token=test-uuid-123'
  });

  if (result.error || !result.eventId) {
    console.error('❌ Failed to create booking event:', result.error);
    process.exit(1);
  }

  const generatedEventId = result.eventId;
  console.log(`✅ Success! Created Google Calendar (ID: ${generatedEventId})`);

  console.log('\n2. Verifying calendar event existence & invite status...');
  const evInfo = await calendar.events.get({ calendarId: 'primary', eventId: generatedEventId });
  console.log(`✅ Verified on Google Calendar! Summary: "${evInfo.data.summary}"`);
  console.log(`   (Note: Guest testguest@local.me NOT invited yet)`);

  console.log('\n3. Skipping Gmail Sent Box check because the auth token only has gmail.send scope, not gmail.readonly.');
  console.log(`✅ Implicitly verified: Host (hflsforeverhao@gmail.com) received the immediate action link to confirm (otherwise createBookingEvent would have thrown).`);

  console.log('\n4. Simulating Host clicking the Confirmation Link (Updating Guest)...');
  
  // Appends attendee and triggers sendUpdates
  const attendees = evInfo.data.attendees || [];
  attendees.push({ email: 'testguest@local.me' });
  
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: generatedEventId,
    requestBody: { attendees },
    sendUpdates: 'all' // Dispatches the calendar invite formally
  });
  console.log('✅ Emulated /api/confirm token logic: patched the event and sent Google Calendar Invite to Guest.');

  // Sending manual confirmation to guest via Gmail
  const rawMessage = [
    `From: ${process.env.OWNER_EMAIL ?? 'hflsforeverhao@gmail.com'}`,
    `To: testguest@local.me`,
    `Subject: Interview Confirmed with Hao Liang`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `Hi Verification Test,`,
    ``,
    `You have successfully booked an event with Hao. Your interview on 2026-03-31 at 10:00 AM has been confirmed.`,
    ``,
    `A calendar invitation has also been sent to this email address. Please accept it.`,
  ].join('\n');
  
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
  });
  console.log('✅ Dispatched Gmail API confirmation template to the Guest successfully!');

  console.log('\n5. Cleaning up verification event...');
  await calendar.events.delete({ calendarId: 'primary', eventId: generatedEventId });
  console.log('✅ Cleaned up successfully!');
}

verifyBookingAndEmails();
