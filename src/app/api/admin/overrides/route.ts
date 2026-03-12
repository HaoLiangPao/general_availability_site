import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { isValidDate, isValidTime } from '@/lib/booking';

async function validateSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_session')?.value;
  if (!token) return false;
  const sql = getDb();
  const rows = await sql`SELECT token FROM admin_sessions WHERE token = ${token}`;
  return rows.length > 0;
}

/**
 * GET /api/admin/overrides?date=2026-03-17
 * Returns all slot overrides for the given date.
 */
export async function GET(req: Request) {
  try {
    if (!(await validateSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    const sql = getDb();

    if (date) {
      const overrides = await sql`
        SELECT id, date, time, action, created_at
        FROM slot_overrides
        WHERE date = ${date}
        ORDER BY time
      `;
      return NextResponse.json({ overrides });
    }

    // No date → return all overrides (for overview)
    const overrides = await sql`
      SELECT id, date, time, action, created_at
      FROM slot_overrides
      ORDER BY date, time
    `;
    return NextResponse.json({ overrides });
  } catch (err) {
    console.error('[admin/overrides GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PUT /api/admin/overrides
 * Body: { date, time, action }
 * Creates or updates an override. action = 'block' | 'force_open'
 */
export async function PUT(req: Request) {
  try {
    if (!(await validateSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date, time, action } = await req.json();

    if (!date || !time || !action) {
      return NextResponse.json({ error: 'Missing date, time, or action' }, { status: 400 });
    }
    if (!isValidDate(date)) {
      return NextResponse.json({ error: 'Invalid date format (expected YYYY-MM-DD)' }, { status: 400 });
    }
    if (!isValidTime(time)) {
      return NextResponse.json({ error: 'Invalid time — must be a supported slot time' }, { status: 400 });
    }
    if (action !== 'block' && action !== 'force_open') {
      return NextResponse.json({ error: 'action must be "block" or "force_open"' }, { status: 400 });
    }

    const sql = getDb();

    // Upsert — ON CONFLICT updates the action
    await sql`
      INSERT INTO slot_overrides (date, time, action)
      VALUES (${date}, ${time}, ${action})
      ON CONFLICT (date, time) DO UPDATE SET action = ${action}
    `;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/overrides PUT]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/overrides
 * Body: { date, time }
 * Removes an override (returns slot to default/calendar behavior).
 */
export async function DELETE(req: Request) {
  try {
    if (!(await validateSession())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date, time } = await req.json();

    if (!date || !time) {
      return NextResponse.json({ error: 'Missing date or time' }, { status: 400 });
    }
    if (!isValidDate(date)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    if (!isValidTime(time)) {
      return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
    }

    const sql = getDb();
    await sql`DELETE FROM slot_overrides WHERE date = ${date} AND time = ${time}`;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/overrides DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
