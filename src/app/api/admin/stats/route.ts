import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { cookies } from 'next/headers';
import type { Booking } from '@/lib/db';
import { sanitizeHeaderValue } from '@/lib/booking';

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

    const { id, reason } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const cancellationReason = reason?.trim()
      ? reason.trim()
      : 'Due to personal health reasons, this meeting can no longer take place.';

    const sql = getDb();
    
    // 1. Load the original booking to notify the user
    const existing = await sql`SELECT * FROM bookings WHERE id = ${id}`;
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const b = existing[0];

    // 2. Fetch external dependencies (only act if Google token is configured)
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      const { google } = require('googleapis');
      const { getGoogleOAuth2Client } = require('@/lib/calendar');
      
      const auth = getGoogleOAuth2Client();
      const calendar = google.calendar({ version: 'v3', auth });
      const gmail = google.gmail({ version: 'v1', auth });

      if (b.calendar_event_id) {
        try {
          await calendar.events.delete({ calendarId: 'primary', eventId: b.calendar_event_id, sendUpdates: 'all' });
        } catch(cErr) {
          console.error('[admin/stats] Failed deleting calendar event:', cErr);
        }
      }

      // 3. Send manual cancellation email over Gmail
      const ownerEmail = sanitizeHeaderValue(process.env.OWNER_EMAIL ?? 'hflsforeverhao@gmail.com');
      const guestEmail = sanitizeHeaderValue(b.email);
      const rawMessage = [
        `From: ${ownerEmail}`,
        `To: ${guestEmail}`,
        `Subject: Booking Cancelled - Hao Liang`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        `Hi ${b.name},`,
        ``,
        `We regret to inform you that your booking has been cancelled.`,
        ``,
        `─────────────────────────────────`,
        ` Event:   ${b.type === 'interview' ? 'Job Interview' : b.type === 'coffee' ? 'Coffee Chat' : b.type === 'in_person' ? 'In-Person Event' : b.type === 'ski_lesson' ? 'Ski Lesson' : b.type}`,
        ` Date:    ${b.date}`,
        ` Time:    ${b.time}`,
        `─────────────────────────────────`,
        ``,
        `Reason: ${cancellationReason}`,
        ``,
        `We apologize for any inconvenience. If you would like to reschedule,`,
        `please visit the booking site or reach out to Hao directly.`,
        ``,
        `Best regards,`,
        `Hao Liang`
      ].join('\n');
  
      try {
        await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw: Buffer.from(rawMessage).toString('base64url') },
        });
      } catch(gErr) {
        console.error('[admin/stats] Failed sending cancel email:', gErr);
      }
    }

    // 4. Finally delete from internal DB
    await sql`DELETE FROM bookings WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[admin/stats DELETE]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
