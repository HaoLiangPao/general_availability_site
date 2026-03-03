import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import type { Booking } from '@/lib/db';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const session = db.prepare('SELECT token FROM admin_sessions WHERE token = ?').get(token);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all() as Booking[];

  // Compute stats
  const total = bookings.length;
  const byType: Record<string, number> = {};
  const byDate: Record<string, number> = {};

  for (const b of bookings) {
    byType[b.type] = (byType[b.type] ?? 0) + 1;
    byDate[b.date] = (byDate[b.date] ?? 0) + 1;
  }

  // Recent 7 days activity
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const recentBookings = bookings.filter(b => b.date >= sevenDaysAgo);

  return NextResponse.json({
    total,
    byType,
    byDate,
    recentCount: recentBookings.length,
    bookings,
  });
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const session = db.prepare('SELECT token FROM admin_sessions WHERE token = ?').get(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
  return NextResponse.json({ success: true });
}
