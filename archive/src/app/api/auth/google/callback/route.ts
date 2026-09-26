/**
 * GET /api/auth/google/callback
 *
 * This route is only ever hit ONCE — when you run the initial OAuth authorization
 * to obtain a refresh_token. After that, the refresh_token is stored in your
 * environment variables and this route is never used again at runtime.
 *
 * Redirect URI setup in Google Cloud Console:
 *   Local dev:   http://localhost:3000/api/auth/google/callback
 *   Production:  https://YOUR_DOMAIN/api/auth/google/callback
 *
 * Add BOTH to the "Authorized redirect URIs" list — Google allows multiple.
 */

import { NextResponse } from 'next/server';
import { getGoogleOAuth2Client } from '@/lib/calendar';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google denied access: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code received' }, { status: 400 });
  }

  try {
    const client = getGoogleOAuth2Client();
    const { tokens } = await client.getToken(code);

    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return new NextResponse(
        `
        <html><body style="font-family:monospace;padding:40px;background:#0d1117;color:#e6edf3">
          <h2>⚠️ No refresh_token returned</h2>
          <p>This usually means your app already has access. To get a fresh refresh_token:</p>
          <ol>
            <li>Go to <a href="https://myaccount.google.com/permissions" style="color:#58a6ff">Google Account Permissions</a></li>
            <li>Revoke access for your app</li>
            <li>Re-run: <code>npm run setup-oauth</code></li>
          </ol>
        </body></html>
        `,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new NextResponse(
      `
      <html><body style="font-family:monospace;padding:40px;background:#0d1117;color:#e6edf3">
        <h2>✅ Google OAuth successful!</h2>
        <p>Copy this refresh token into your <code>.env.local</code> (local) or your hosting platform environment variables:</p>
        <pre style="background:#161b22;border:1px solid #30363d;padding:20px;border-radius:8px;word-break:break-all;color:#58a6ff">GOOGLE_REFRESH_TOKEN=${refreshToken}</pre>
        <p style="color:#8b949e">⚠️ Keep this secret. Do NOT commit it to git.</p>
        <p style="color:#8b949e">After adding it, restart your server. This page will not show again.</p>
      </body></html>
      `,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    console.error('[oauth] Token exchange error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
