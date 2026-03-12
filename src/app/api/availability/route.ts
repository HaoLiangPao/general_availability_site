import { NextResponse } from 'next/server';
import { CANDIDATE_TIMES, DURATIONS } from '@/lib/booking';
import { resolveSlots } from '@/lib/availability';

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

  const duration = DURATIONS[type as keyof typeof DURATIONS] ?? 45;
  const slots = await resolveSlots(date, CANDIDATE_TIMES, duration);

  return NextResponse.json({ slots, lastSynced: new Date().toISOString() });
}
