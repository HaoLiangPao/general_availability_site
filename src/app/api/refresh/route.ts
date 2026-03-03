import { NextResponse } from 'next/server';
import { getAllBusySlots } from '@/lib/calendar';

// Simple in-memory cache for the busy slots
let cachedBusy: { data: Awaited<ReturnType<typeof getAllBusySlots>>; at: number } | null = null;

export async function POST() {
  try {
    cachedBusy = { data: await getAllBusySlots(30), at: Date.now() };
    return NextResponse.json({
      success: true,
      message: `Calendars synced — ${cachedBusy.data.length} busy interval(s) found.`,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[refresh]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
