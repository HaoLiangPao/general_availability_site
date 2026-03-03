import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_session')?.value;

    if (token) {
      const sql = getDb();
      await sql`DELETE FROM admin_sessions WHERE token = ${token}`;
    }

    cookieStore.set('admin_session', '', { maxAge: 0, path: '/' });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/logout]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
