import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    const validUser = process.env.ADMIN_USERNAME ?? 'admin';
    const validPass = process.env.ADMIN_PASSWORD ?? 'changeme';

    if (username !== validUser || password !== validPass) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Create a session token
    const token = randomBytes(32).toString('hex');
    const sql = getDb();
    await sql`INSERT INTO admin_sessions (token) VALUES (${token})`;

    const cookieStore = await cookies();
    cookieStore.set('admin_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/login]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
