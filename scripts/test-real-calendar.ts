import fs from 'fs';
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}
import { createBookingEvent } from '../src/lib/calendar';

async function run() {
  const result = await createBookingEvent({
    type: 'ski_lesson',
    typeLabel: 'Ski Lesson',
    date: '2026-03-08',
    time: '09:00 AM',
    durationMinutes: 60,
    guestName: 'Real Test',
    guestEmail: 'test@local.com',
    notes: 'Testing real calendar',
    confirmLink: 'http://localhost/confirm?token=123'
  });
  console.log('Got result:', result);
}
run();
