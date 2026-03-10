import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { google } from 'googleapis';
import { getGoogleOAuth2Client } from '@/lib/calendar';
import { escapeHtml, sanitizeHeaderValue } from '@/lib/booking';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  try {
    const sql = getDb();
    const bookings = await sql`SELECT * FROM bookings WHERE confirm_token = ${token}`;
    if (bookings.length === 0) {
      return NextResponse.json({ error: 'Invalid or already used token' }, { status: 400 });
    }

    const booking = bookings[0];
    if (booking.status === 'confirmed') {
      return NextResponse.json({ message: 'Booking already confirmed' });
    }

    if (!booking.calendar_event_id || !process.env.GOOGLE_REFRESH_TOKEN) {
      return NextResponse.json(
        { error: 'Booking cannot be confirmed until Google Calendar is configured and the event exists.' },
        { status: 409 }
      );
    }

    const auth = getGoogleOAuth2Client();
    const calendar = google.calendar({ version: 'v3', auth });

    try {
      const ev = await calendar.events.get({ calendarId: 'primary', eventId: booking.calendar_event_id });
      const attendees = ev.data.attendees || [];
      const normalizedEmail = booking.email.toLowerCase();
      const dedupedAttendees = attendees.some(
        attendee => attendee.email?.toLowerCase() === normalizedEmail
      )
        ? attendees
        : [...attendees, { email: booking.email }];

      await calendar.events.patch({
        calendarId: 'primary',
        eventId: booking.calendar_event_id,
        requestBody: { attendees: dedupedAttendees },
        sendUpdates: 'all',
      });

      const gmail = google.gmail({ version: 'v1', auth });
      const ownerEmail = sanitizeHeaderValue(process.env.OWNER_EMAIL ?? 'hflsforeverhao@gmail.com');
      const guestEmail = sanitizeHeaderValue(booking.email);
      const rawMessage = [
        `From: ${ownerEmail}`,
        `To: ${guestEmail}`,
        `Subject: Interview Confirmed with Hao Liang`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `Hi ${booking.name},`,
        ``,
        `You have successfully booked an event with Hao. Your interview on ${booking.date} at ${booking.time} has been confirmed.`,
        ``,
        `A calendar invitation has also been sent to this email address. Please accept it.`,
        ``,
        `Best,`,
        `Hao Liang`
      ].join('\n');

      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
      });
    } catch (err) {
      console.error('[confirm API] Error updating external services', err);
      return NextResponse.json({ error: 'Failed to confirm booking in Google Calendar.' }, { status: 502 });
    }

    await sql`UPDATE bookings SET status = 'confirmed', confirm_token = NULL WHERE id = ${booking.id}`;

    // Rather than returning raw JSON, return an HTML confirmation wrapper so Hao gets a nice page
    return new NextResponse(`
      <html>
        <head>
          <meta charset="utf-8">
          <title>Confirmed</title>
        </head>
        <body style="font-family:sans-serif; text-align:center; padding-top: 50px;">
          <h1 style="color:green;">Interview Confirmed Successfully ✅</h1>
          <p>The status was changed to 'confirmed' and emails/invites have been dispatched to ${escapeHtml(booking.email)}.</p>
        </body>
      </html>
    `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  } catch (err) {
    console.error('[confirm API] Error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
