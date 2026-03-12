import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createBookingEvent, parseDateTimeLocal } from '@/lib/calendar';
import { resolveSlots } from '@/lib/availability';
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

    // Compute canonical timestamps once
    const startAt = parseDateTimeLocal(date, time);
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    // Full availability check — same resolver as GET /api/availability.
    // Enforces: block overrides, DB booking overlaps, external calendar busy.
    // force_open bypasses external calendar but not DB bookings.
    const [resolution] = await resolveSlots(date, [time], durationMinutes);
    if (!resolution.available) {
      const msg = resolution.override === 'block'
        ? 'This time slot has been closed by the host. Please pick another time.'
        : 'That slot is no longer available. Please refresh and pick another time.';
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // Insert with start_at/end_at — the DB exclusion constraint is the final guard
    // against concurrent requests that pass the resolver simultaneously.
    const sql = getDb();
    let id: number;
    try {
      const result = await sql`
        INSERT INTO bookings (type, date, time, name, email, notes, status, confirm_token, start_at, end_at)
        VALUES (
          ${type}, ${date}, ${time}, ${name}, ${email}, ${notes || null},
          ${status}, ${confirmToken},
          ${startAt.toISOString()}::timestamptz,
          ${endAt.toISOString()}::timestamptz
        )
        RETURNING id
      `;
      id = result[0]?.id;
    } catch (dbErr: unknown) {
      // Postgres exclusion_violation = 23P01 (concurrent race)
      const pgCode = (dbErr as { code?: string })?.code;
      if (pgCode === '23P01') {
        return NextResponse.json(
          { error: 'That slot is no longer available. Please refresh and pick another time.' },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
    const host = req.headers.get('host') ?? 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    const confirmLink = isInterview ? `${baseUrl}/api/confirm?token=${confirmToken}` : undefined;

    // Create Google Calendar event + send owner notification (best-effort)
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
      // Calendar failed — roll back the DB insert so the slot is freed
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
