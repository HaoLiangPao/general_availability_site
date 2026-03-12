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

  await sql`CREATE EXTENSION IF NOT EXISTS btree_gist`;

  await sql`
    CREATE TABLE IF NOT EXISTS bookings (
      id                SERIAL PRIMARY KEY,
      type              TEXT NOT NULL,
      date              TEXT NOT NULL,
      time              TEXT NOT NULL,
      name              TEXT NOT NULL,
      email             TEXT NOT NULL,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'confirmed',
      confirm_token     TEXT,
      calendar_event_id TEXT,
      start_at          TIMESTAMPTZ NOT NULL,
      end_at            TIMESTAMPTZ NOT NULL,
      created_at        TIMESTAMPTZ DEFAULT NOW(),

      CONSTRAINT no_overlap_active
        EXCLUDE USING gist (
          tstzrange(start_at, end_at, '[)') WITH &&
        )
        WHERE (status IN ('pending', 'confirmed'))
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS slot_overrides (
      id         SERIAL PRIMARY KEY,
      date       TEXT NOT NULL,
      time       TEXT NOT NULL,
      action     TEXT NOT NULL CHECK (action IN ('block', 'force_open')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, time)
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
  status: string;
  confirm_token: string | null;
  calendar_event_id: string | null;
  start_at: string;
  end_at: string;
  created_at: string;
};

export type SlotOverride = {
  id: number;
  date: string;
  time: string;
  action: 'block' | 'force_open';
  created_at: string;
};

