import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createBookingEvent } from '@/lib/calendar';
import { randomUUID } from 'crypto';

const TYPE_LABELS: Record<string, string> = {
  interview: 'Job Interview',
  coffee:    'Coffee Chat',
  in_person: 'In-Person Event',
  ski_lesson: 'Ski Lesson'
};

const DURATIONS: Record<string, number> = {
  interview: 45,
  coffee:    30,
  in_person: 60,
  ski_lesson: 60
};

export async function POST(req: Request) {
  try {
    const { type, date, time, name, email, notes } = await req.json();

    if (!type || !date || !time || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isInterview = type === 'interview';
    const confirmToken = isInterview ? randomUUID() : null;
    const status = isInterview ? 'pending' : 'confirmed';

    // 1. Persist to Postgres
    const sql = getDb();
    const result = await sql`
      INSERT INTO bookings (type, date, time, name, email, notes, status, confirm_token)
      VALUES (${type}, ${date}, ${time}, ${name}, ${email}, ${notes ?? null}, ${status}, ${confirmToken})
      RETURNING id
    `;
    const id = result[0]?.id;

    const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
    const host = req.headers.get('host') ?? 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    const confirmLink = isInterview ? `${baseUrl}/api/confirm?token=${confirmToken}` : undefined;

    // 2. Create Google Calendar event + send owner notification (best-effort)
    const calResult = await createBookingEvent({
      type,
      typeLabel:       TYPE_LABELS[type] ?? type,
      date,
      time,
      durationMinutes: DURATIONS[type] ?? 45,
      guestName:       name,
      guestEmail:      email,
      notes:           notes ?? '',
      confirmLink
    });

    if (calResult.error) {
      console.warn('[book] Calendar event warning:', calResult.error);
    } else if (calResult.eventId) {
      console.log('[book] Calendar event created:', calResult.eventId);
      await sql`UPDATE bookings SET calendar_event_id = ${calResult.eventId} WHERE id = ${id}`;
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[book]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
