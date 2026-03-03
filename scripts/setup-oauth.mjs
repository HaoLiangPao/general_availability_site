#!/usr/bin/env node
/**
 * scripts/setup-oauth.mjs
 *
 * One-time script to authorize your app with Google and obtain a refresh_token.
 * Run this ONCE locally (not on your server), then paste the refresh_token into
 * your hosting platform's environment variables.
 *
 * Usage:
 *   npm run setup-oauth
 *
 * Prerequisites:
 *   GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local
 */

import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';

const require = createRequire(import.meta.url);

// Load .env.local manually
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (key && !process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

const { google } = require('googleapis');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/auth/google/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌  GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local\n');
  console.error('Steps:\n  1. Go to https://console.cloud.google.com/apis/credentials\n  2. Create an OAuth 2.0 Client ID\n  3. Download the JSON and paste the values into .env.local\n');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Scopes needed:
//   calendar.events    → create/read events
//   calendar.readonly  → read freebusy
//   gmail.send         → send notification emails to yourself
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',      // force consent screen → always returns refresh_token
  scope: SCOPES,
});

console.log('\n🔐  Google OAuth2 Setup\n');
console.log('1. Open this URL in your browser:\n');
console.log(`   ${authUrl}\n`);
console.log('2. Sign in with the Google account whose calendar you want to sync.');
console.log('   Grant all requested permissions.\n');
console.log('3. After authorizing, your browser will redirect to:\n');
console.log(`   ${REDIRECT_URI}\n`);
console.log('   The page will display your GOOGLE_REFRESH_TOKEN.\n');
console.log('4. Copy the token and add it to .env.local:\n');
console.log('   GOOGLE_REFRESH_TOKEN=<paste here>\n');
console.log('   Then add the same token to your hosting platform\'s environment variables.\n');

// Optional: if the dev server is running, open the URL automatically
try {
  const { execSync } = require('child_process');
  execSync(`xdg-open "${authUrl}" 2>/dev/null || open "${authUrl}" 2>/dev/null`, { stdio: 'ignore' });
  console.log('✅  Browser opened automatically.\n');
} catch {
  console.log('ℹ️  Copy the URL above and open it manually.\n');
}
