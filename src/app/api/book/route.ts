import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createBookingEvent, filterAvailableSlots, getAllBusySlots, parseDateTimeLocal } from '@/lib/calendar';
import { randomUUID } from 'crypto';
import {
  DURATIONS,
  TYPE_LABELS,
  isBookingType,
  isValidDate,
  isValidEmail,
  isValidTime,
} from '@/lib/booking';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const type = typeof body.type === 'string' ? body.type : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const time = typeof body.time === 'string' ? body.time : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

    if (!type || !date || !time || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!isBookingType(type)) {
      return NextResponse.json({ error: 'Unsupported booking type' }, { status: 400 });
    }
    if (!isValidDate(date) || !isValidTime(time)) {
      return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const isInterview = type === 'interview';
    const confirmToken = isInterview ? randomUUID() : null;
    const status = isInterview ? 'pending' : 'confirmed';
    const durationMinutes = DURATIONS[type];

    const sql = getDb();
    const busy = await getAllBusySlots(30);
    const dbBookings = await sql`
      SELECT date, time, type
      FROM bookings
      WHERE date = ${date} AND status IN ('pending', 'confirmed')
    `;
    for (const booking of dbBookings) {
      const existingDuration = DURATIONS[booking.type as keyof typeof DURATIONS] ?? 45;
      const slotStart = parseDateTimeLocal(booking.date, booking.time);
      const slotEnd = new Date(slotStart.getTime() + existingDuration * 60_000);
      busy.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }

    const requestedSlot = filterAvailableSlots(date, [time], durationMinutes, busy)[0];
    if (!requestedSlot?.available) {
      return NextResponse.json(
        { error: 'That slot is no longer available. Please refresh availability and pick another time.' },
        { status: 409 }
      );
    }

    const result = await sql`
      INSERT INTO bookings (type, date, time, name, email, notes, status, confirm_token)
      VALUES (${type}, ${date}, ${time}, ${name}, ${email}, ${notes || null}, ${status}, ${confirmToken})
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
      durationMinutes,
      guestName:       name,
      guestEmail:      email,
      notes,
      confirmLink,
      inviteGuest: !isInterview,
    });

    if (calResult.error) {
      await sql`DELETE FROM bookings WHERE id = ${id}`;
      return NextResponse.json(
        { success: false, error: 'Unable to reserve this time right now. Please try again.' },
        { status: 503 }
      );
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
