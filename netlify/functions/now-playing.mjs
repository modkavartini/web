/**
 * Spotify "Now Playing" — reads directly from the Spotify Web API, so it works
 * on any device, with or without Discord.
 *
 * Env (set in Netlify): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
 * Get the refresh token once via /api/spotify-auth.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode';
const RECENT_URL = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

// Access tokens last an hour; keep one per warm function instance.
let cachedToken = { value: null, expiresAt: 0 };

async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 30_000) return cachedToken.value;

  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
    throw new Error('Spotify env vars are not configured');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: SPOTIFY_REFRESH_TOKEN })
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);

  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

function shapeTrack(item) {
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  const images = isEpisode ? item.images : item.album?.images;
  return {
    title: item.name,
    artist: isEpisode ? item.show?.name : item.artists?.map(a => a.name).join(', '),
    album: isEpisode ? item.show?.name : item.album?.name,
    albumArt: images?.[0]?.url ?? null,
    url: item.external_urls?.spotify ?? null,
    duration: item.duration_ms
  };
}

export default async () => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  try {
    const token = await getAccessToken();
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const nowRes = await fetch(NOW_PLAYING_URL, auth);

    // 200 with is_playing → live track; 204 → nothing active
    if (nowRes.status === 200) {
      const now = await nowRes.json();
      if (now.is_playing && now.item) {
        return new Response(JSON.stringify({
          isPlaying: true,
          track: shapeTrack(now.item),
          progress: now.progress_ms,
          fetchedAt: Date.now()
        }), { headers });
      }
    }

    // Idle: surface the last thing played instead of an empty card
    const recentRes = await fetch(RECENT_URL, auth);
    const recent = recentRes.ok ? await recentRes.json() : null;
    const last = recent?.items?.[0];

    return new Response(JSON.stringify({
      isPlaying: false,
      lastPlayed: last ? { ...shapeTrack(last.track), playedAt: last.played_at } : null,
      fetchedAt: Date.now()
    }), { headers });
  } catch (error) {
    console.error('now-playing:', error.message);
    return new Response(JSON.stringify({ isPlaying: false, error: error.message }), { status: 500, headers });
  }
};
