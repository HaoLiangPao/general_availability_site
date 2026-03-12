/**
 * lib/availability.ts — shared slot availability resolver
 *
 * Used by both GET /api/availability and POST /api/book so that
 * they always agree on whether a slot is bookable.
 *
 * Priority order:
 *   1. block override  → always unavailable
 *   2. DB booking overlap → always unavailable
 *   3. force_open override → available (bypasses external calendar)
 *   4. External calendar busy → unavailable
 *   5. Otherwise → available
 */

import { getAllBusySlots, parseDateTimeLocal, type BusyInterval } from '@/lib/calendar';
import { getDb } from '@/lib/db';

export interface SlotResolution {
  time: string;
  available: boolean;
  override: 'block' | 'force_open' | null;
}

/**
 * Resolves availability for a list of time slots on a given date.
 *
 *  @param date  - ISO date string, e.g. '2026-03-17'
 *  @param times - list of candidate time labels, e.g. ['10:00 AM', '10:30 AM']
 *  @param durationMinutes - duration in minutes for the booking type
 */
export async function resolveSlots(
  date: string,
  times: readonly string[],
  durationMinutes: number,
): Promise<SlotResolution[]> {
  if (times.length === 0) return [];

  const sql = getDb();

  // Compute day boundaries from the first/last candidate time
  const dayStart = parseDateTimeLocal(date, times[0]);
  const dayEnd = parseDateTimeLocal(date, times[times.length - 1]);
  const dayEndExtended = new Date(dayEnd.getTime() + durationMinutes * 60_000);

  // Fetch external calendar, DB bookings, and overrides in parallel
  const [externalBusy, dbBookings, overrideRows] = await Promise.all([
    getAllBusySlots(30),
    sql`
      SELECT start_at, end_at FROM bookings
      WHERE status IN ('pending', 'confirmed')
        AND start_at < ${dayEndExtended.toISOString()}::timestamptz
        AND end_at   > ${dayStart.toISOString()}::timestamptz
    `,
    sql`SELECT time, action FROM slot_overrides WHERE date = ${date}`,
  ]);

  // Build lookup structures
  const dbIntervals: BusyInterval[] = dbBookings.map(b => ({
    start: b.start_at,
    end: b.end_at,
  }));

  const overrideMap = new Map<string, 'block' | 'force_open'>();
  for (const o of overrideRows) {
    overrideMap.set(o.time, o.action as 'block' | 'force_open');
  }

  // Helper: check if [slotStart, slotEnd) overlaps any interval in the list
  function overlaps(slotStartMs: number, slotEndMs: number, intervals: BusyInterval[]): boolean {
    return intervals.some(b => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      return slotStartMs < bEnd && slotEndMs > bStart;
    });
  }

  // Resolve each slot
  return times.map(time => {
    const override = overrideMap.get(time) ?? null;
    const slotStart = parseDateTimeLocal(date, time);
    const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
    const slotStartMs = slotStart.getTime();
    const slotEndMs = slotEnd.getTime();

    // Rule 1: block override → always unavailable
    if (override === 'block') {
      return { time, available: false, override };
    }

    // Rule 2: DB booking overlap → always unavailable
    if (overlaps(slotStartMs, slotEndMs, dbIntervals)) {
      return { time, available: false, override };
    }

    // Rule 3: force_open → available (bypasses external calendar)
    if (override === 'force_open') {
      return { time, available: true, override };
    }

    // Rule 4: external calendar busy → unavailable
    if (overlaps(slotStartMs, slotEndMs, externalBusy)) {
      return { time, available: false, override };
    }

    // Rule 5: available
    return { time, available: true, override };
  });
}
