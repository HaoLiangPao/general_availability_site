import { NextResponse } from 'next/server';
import { getAllBusySlots, filterAvailableSlots, parseDateTimeLocal } from '@/lib/calendar';
import { getDb } from '@/lib/db';
import { CANDIDATE_TIMES, DURATIONS } from '@/lib/booking';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');          // e.g. 2026-03-04
  const type = searchParams.get('type') ?? 'interview';

  if (!date) {
    return NextResponse.json({ error: 'date param required' }, { status: 400 });
  }

  // Block the weekends for Interview type of events
  if (type === 'interview') {
    const d = new Date(date + 'T12:00:00'); // Midday to avoid timezone shifting
    if (d.getDay() === 0 || d.getDay() === 6) {
      const emptySlots = CANDIDATE_TIMES.map(time => ({ time, available: false }));
      return NextResponse.json({ slots: emptySlots, lastSynced: new Date().toISOString() });
    }
  }

  const busy = await getAllBusySlots(30);
  
  // Directly append Local DB rows to block out immediate conflicts
  try {
    const sql = getDb();
    const dbBookings = await sql`SELECT date, time, type FROM bookings WHERE date = ${date} AND status IN ('pending', 'confirmed')`;
    for (const b of dbBookings) {
      const bDuration = DURATIONS[b.type as keyof typeof DURATIONS] ?? 45;
      const slotStart = parseDateTimeLocal(b.date, b.time);
      const slotEnd = new Date(slotStart.getTime() + bDuration * 60_000);
      busy.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
    }
  } catch (err) {
    console.error('[availability] DB Sync error:', err);
  }

  const duration = DURATIONS[type as keyof typeof DURATIONS] ?? 45;
  const slots = filterAvailableSlots(date, CANDIDATE_TIMES, duration, busy);

  return NextResponse.json({ slots, lastSynced: new Date().toISOString() });
}
