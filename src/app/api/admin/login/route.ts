import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();

    const validUser = process.env.ADMIN_USERNAME ?? 'admin';
    const validPass = process.env.ADMIN_PASSWORD ?? 'changeme';

    if (username !== validUser || password !== validPass) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = randomBytes(32).toString('hex');
    const db = getDb();
    db.prepare('INSERT INTO admin_sessions (token) VALUES (?)').run(token);

    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 hours
      path: '/',
    });
    return response;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
