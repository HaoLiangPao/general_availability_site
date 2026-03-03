/**
 * lib/db.ts — Postgres via @neondatabase/serverless
 *
 * Works on Vercel serverless functions and locally with any Postgres
 * connection string set in POSTGRES_URL.
 */

import { neon } from '@neondatabase/serverless';

function getSql() {
  const url = process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL environment variable is not set');
  return neon(url);
}

// Re-export a lazy sql tagged-template helper
export function getDb() {
  return getSql();
}

// Run once after creating the database (npm run migrate)
export async function initDb() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id        SERIAL PRIMARY KEY,
      type      TEXT NOT NULL,
      date      TEXT NOT NULL,
      time      TEXT NOT NULL,
      name      TEXT NOT NULL,
      email     TEXT NOT NULL,
      notes     TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export type Booking = {
  id: number;
  type: string;
  date: string;
  time: string;
  name: string;
  email: string;
  notes: string | null;
  created_at: string;
};
