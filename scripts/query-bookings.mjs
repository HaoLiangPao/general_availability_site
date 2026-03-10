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
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.POSTGRES_URL);
const result = await sql`SELECT id, type, name, email, calendar_event_id, status FROM bookings ORDER BY id DESC LIMIT 5`;
console.log(result);
