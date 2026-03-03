import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import type { Booking } from '@/lib/db';

async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return false;

  const sql = getDb();
  const rows = await sql`SELECT token FROM admin_sessions WHERE token = ${token}`;
  return rows.length > 0;
}

// GET — fetch all bookings + aggregate stats
export async function GET() {
  try {
    if (!(await validateSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();
    const bookings = await sql`SELECT * FROM bookings ORDER BY created_at DESC` as Booking[];

    const total = bookings.length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const recentCount = bookings.filter(b => b.created_at >= sevenDaysAgo).length;

    const byType: Record<string, number> = {};
    for (const b of bookings) {
      byType[b.type] = (byType[b.type] ?? 0) + 1;
    }

    return NextResponse.json({ bookings, stats: { total, recentCount, byType } });
  } catch (err) {
    console.error('[admin/stats GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE — remove a single booking by id
export async function DELETE(req: Request) {
  try {
    if (!(await validateSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const sql = getDb();
    await sql`DELETE FROM bookings WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/stats DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
