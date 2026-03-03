import { NextResponse } from 'next/server';
import { getAllBusySlots, filterAvailableSlots } from '@/lib/calendar';

// Candidate times shown on the booking page
const CANDIDATE_TIMES = [
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM',
];

const DURATION: Record<string, number> = {
  interview: 45,
  coffee: 30,
  in_person: 60,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');          // e.g. 2026-03-04
  const type = searchParams.get('type') ?? 'interview';

  if (!date) {
    return NextResponse.json({ error: 'date param required' }, { status: 400 });
  }

  const busy = await getAllBusySlots(30);
  const duration = DURATION[type] ?? 45;
  const slots = filterAvailableSlots(date, CANDIDATE_TIMES, duration, busy);

  return NextResponse.json({ slots, lastSynced: new Date().toISOString() });
}
