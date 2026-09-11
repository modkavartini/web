/**
 * One-time helper to obtain SPOTIFY_REFRESH_TOKEN.
 *
 *   1. Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET in Netlify env.
 *   2. Add this URL as a Redirect URI in the Spotify app settings.
 *   3. Visit /api/spotify-auth, approve, copy the token it shows into
 *      SPOTIFY_REFRESH_TOKEN, redeploy.
 *
 * Disables itself once SPOTIFY_REFRESH_TOKEN is set.
 */

const SCOPES = 'user-read-currently-playing user-read-recently-played';

const html = (body, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><title>Spotify auth</title>
   <body style="font-family:system-ui;background:#1e1e2e;color:#cdd6f4;padding:40px;line-height:1.6">${body}</body>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
);

export default async (req) => {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;

  if (SPOTIFY_REFRESH_TOKEN) {
    return html('<h1>Already configured</h1><p>Unset <code>SPOTIFY_REFRESH_TOKEN</code> to run this again.</p>', 410);
  }
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return html('<h1>Missing config</h1><p>Set <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> first.</p>', 500);
  }

  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/spotify-auth`;
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return html(`<h1>Spotify said no</h1><p>${error}</p>`, 400);

  // Step 1: send the user to Spotify
  if (!code) {
    const authorize = new URL('https://accounts.spotify.com/authorize');
    authorize.search = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      show_dialog: 'true'
    });
    return Response.redirect(authorize.toString(), 302);
  }

  // Step 2: exchange the code for a refresh token
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  });
  const data = await res.json();

  if (!res.ok || !data.refresh_token) {
    return html(`<h1>Token exchange failed</h1><pre>${JSON.stringify(data, null, 2)}</pre>`, 500);
  }

  return html(`
    <h1>Refresh token ready</h1>
    <p>Run this in your terminal, then trigger a redeploy:</p>
    <pre style="background:#181825;padding:16px;border-radius:8px;overflow:auto">npx netlify env:set SPOTIFY_REFRESH_TOKEN ${data.refresh_token}</pre>
    <p>This page will refuse to run again once that variable is set.</p>
  `);
};
