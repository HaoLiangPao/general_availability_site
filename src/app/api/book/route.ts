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

    // 1. Persist to local database
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO bookings (type, date, time, name, email, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, date, time, name, email, notes ?? null);

    // 2. Create Google Calendar event + send owner notification (non-blocking on failure)
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
      // Log but don't fail the booking — calendar is best-effort if Google isn't configured yet
      console.warn('[book] Calendar event warning:', calResult.error);
    } else {
      console.log('[book] Calendar event created:', calResult.eventId);
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[book]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
