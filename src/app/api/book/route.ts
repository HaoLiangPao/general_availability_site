import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createBookingEvent } from '@/lib/calendar';

const TYPE_LABELS: Record<string, string> = {
  interview: 'Job Interview',
  coffee:    'Coffee Chat',
  in_person: 'In-Person Event',
};

const DURATIONS: Record<string, number> = {
  interview: 45,
  coffee:    30,
  in_person: 60,
};

export async function POST(req: Request) {
  try {
    const { type, date, time, name, email, notes } = await req.json();

    if (!type || !date || !time || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Persist to Postgres
    const sql = getDb();
    const result = await sql`
      INSERT INTO bookings (type, date, time, name, email, notes)
      VALUES (${type}, ${date}, ${time}, ${name}, ${email}, ${notes ?? null})
      RETURNING id
    `;
    const id = result[0]?.id;

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
    });

    if (calResult.error) {
      console.warn('[book] Calendar event warning:', calResult.error);
    } else {
      console.log('[book] Calendar event created:', calResult.eventId);
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('[book]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
