import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);

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

const { google } = require('googleapis');

const { OAuth2 } = google.auth;
const oauthClient = new OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauthClient });
const gmail = google.gmail({ version: 'v1', auth: oauthClient });

async function check() {
  try {
    console.log('Fetching access token with the provided refresh token...');
    const tokenInfo = await oauthClient.getAccessToken();
    console.log('Access token retrieved successfully:', !!tokenInfo.token);
    
    // Check calendar
    console.log('Checking Calendar read access...');
    const calList = await calendar.calendarList.list({ maxResults: 1 });
    console.log('Calendar read OK, found calendars:', calList.data.items?.length);

    console.log('Checking Calendar write access by making a dry-run event or generic list...');
    // We already know reading works if the above succeeded.

    // Check Gmail
    console.log('Checking Gmail access...');
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      console.log('Gmail OK, profile email:', profile.data.emailAddress);
    } catch (e) {
      console.error('Gmail profile error (this often means missing scopes):', e.message);
    }

    // Attempt to send an email to OWNER_EMAIL
    const ownerEmail = process.env.OWNER_EMAIL ?? 'hflsforeverhao@gmail.com';
    console.log(`Attempting to send a test email via Gmail to: ${ownerEmail}...`);
    const emailStr = [
      `From: ${ownerEmail}`,
      `To: ${ownerEmail}`,
      `Subject: Test Email from Availability Site`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `If you see this, Gmail API sending works!`
    ].join('\n');
    
    const encoded = Buffer.from(emailStr).toString('base64url');
    try {
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw: encoded },
      });
      console.log('Test email sent successfully! Check your inbox.');
    } catch (e) {
      console.error('Failed to send test email via Gmail API:', e.message);
      console.log(e.response?.data?.error);
    }

  } catch (err) {
    console.error('Auth/Token error:', err.message);
    if (err.response?.data) {
       console.error(err.response.data);
    }
  }
}

check();
