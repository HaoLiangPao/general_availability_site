import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { type, date, time, name, email, notes } = await req.json();

    if (!type || !date || !time || !name || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO bookings (type, date, time, name, email, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(type, date, time, name, email, notes ?? null);

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error('[book]', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
