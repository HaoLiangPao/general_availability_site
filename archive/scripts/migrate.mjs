#!/usr/bin/env node
/**
 * scripts/migrate.mjs
 *
 * One-time script to create the required tables in your Postgres database.
 * Run after setting up Neon / Vercel Postgres and adding POSTGRES_URL to .env.local:
 *
 *   npm run migrate
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

// Load .env.local so POSTGRES_URL is available
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

const { neon } = require('@neondatabase/serverless');

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error('\n❌  POSTGRES_URL is not set in .env.local\n');
  console.error('Get your Neon connection string from:');
  console.error('  https://console.neon.tech → your project → Connection details\n');
  process.exit(1);
}

const sql = neon(url);

console.log('\n⏳  Running database migrations…\n');

await sql`
  CREATE TABLE IF NOT EXISTS bookings (
    id         SERIAL PRIMARY KEY,
    type       TEXT NOT NULL,
    date       TEXT NOT NULL,
    time       TEXT NOT NULL,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    notes      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('  ✅  bookings table ready');

await sql`
  CREATE TABLE IF NOT EXISTS admin_sessions (
    token      TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`;
console.log('  ✅  admin_sessions table ready');

console.log('\n✅  Migration complete!\n');
