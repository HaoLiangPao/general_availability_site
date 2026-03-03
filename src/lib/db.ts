/**
 * lib/db.ts
 * SQLite database for storing bookings and admin sessions.
 * DB file is created at the project root: bookings.db
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'bookings.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      date       TEXT NOT NULL,
      time       TEXT NOT NULL,
      name       TEXT NOT NULL,
      email      TEXT NOT NULL,
      notes      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return _db;
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
