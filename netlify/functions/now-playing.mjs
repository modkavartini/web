/**
 * Spotify "Now Playing" — reads directly from the Spotify Web API, so it works
 * on any device, with or without Discord.
 *
 * Returns the current track plus what it's playing from (playlist / album /
 * artist / Liked Songs) and an estimated listening session (derived from
 * recently-played: back-to-back tracks with no real gap are one session).
 *
 * Env (set in Netlify): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
 * Get the refresh token once via /api/spotify-auth.
 */

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const NOW_PLAYING_URL = `${API}/me/player/currently-playing?additional_types=track,episode`;
const RECENT_URL = `${API}/me/player/recently-played?limit=50`;

// A pause longer than this between tracks ends the "session"
const SESSION_GAP_MS = 5 * 60 * 1000;

// Per warm-instance caches
let cachedToken = { value: null, expiresAt: 0 };
let cachedRecent = { items: null, fetchedAt: 0 };
const contextCache = new Map(); // uri -> { name, url, expiresAt }

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

/** What the track is playing from: playlist, album, artist radio, Liked Songs, show. */
async function resolveContext(context, item, auth) {
  if (!context?.uri) return null;
  const [, type, id] = context.uri.split(':');

  if (type === 'collection') {
    return { type: 'collection', name: 'Liked Songs', url: 'https://open.spotify.com/collection/tracks' };
  }
  if (type === 'album' && item?.album) {
    return { type: 'album', name: item.album.name, url: item.album.external_urls?.spotify ?? null };
  }
  if (type === 'show' && item?.show) {
    return { type: 'show', name: item.show.name, url: item.show.external_urls?.spotify ?? null };
  }

  const cached = contextCache.get(context.uri);
  if (cached && Date.now() < cached.expiresAt) return cached;

  const endpoint = type === 'playlist' ? `${API}/playlists/${id}?fields=name,external_urls.spotify`
    : type === 'artist' ? `${API}/artists/${id}`
    : null;
  if (!endpoint) return { type, name: null, url: context.external_urls?.spotify ?? null };

  try {
    const res = await fetch(endpoint, auth);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const resolved = {
      type,
      name: data.name,
      url: data.external_urls?.spotify ?? context.external_urls?.spotify ?? null,
      expiresAt: Date.now() + 10 * 60 * 1000
    };
    contextCache.set(context.uri, resolved);
    return resolved;
  } catch {
    return { type, name: null, url: context.external_urls?.spotify ?? null };
  }
}

async function getRecent(auth) {
  if (cachedRecent.items && Date.now() - cachedRecent.fetchedAt < 60_000) return cachedRecent.items;
  const res = await fetch(RECENT_URL, auth);
  if (!res.ok) return cachedRecent.items ?? [];
  const data = await res.json();
  cachedRecent = { items: data.items ?? [], fetchedAt: Date.now() };
  return cachedRecent.items;
}

/**
 * Walk back through recently-played while each track follows the previous
 * one without a real pause. `currentStartedAt` anchors the chain to the live
 * track (which isn't in recently-played until it finishes).
 */
function estimateSession(recent, currentStartedAt) {
  let anchor = currentStartedAt ?? null;
  let start = anchor;
  let tracks = anchor ? 1 : 0;

  for (const entry of recent) {
    const playedAt = Date.parse(entry.played_at);
    const duration = entry.track?.duration_ms ?? 0;
    if (anchor !== null && anchor - playedAt > duration + SESSION_GAP_MS) break;
    start = playedAt;
    anchor = playedAt;
    tracks += 1;
  }

  if (!start) return null;
  return { startedAt: start, tracks };
}

export default async () => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  try {
    const token = await getAccessToken();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const fetchedAt = Date.now();

    const nowRes = await fetch(NOW_PLAYING_URL, auth);

    // 200 with is_playing → live track; 204 → nothing active
    if (nowRes.status === 200) {
      const now = await nowRes.json();
      if (now.is_playing && now.item) {
        const [context, recent] = await Promise.all([
          resolveContext(now.context, now.item, auth),
          getRecent(auth)
        ]);
        const session = estimateSession(recent, fetchedAt - now.progress_ms);

        return new Response(JSON.stringify({
          isPlaying: true,
          track: shapeTrack(now.item),
          progress: now.progress_ms,
          context: context ? { type: context.type, name: context.name, url: context.url } : null,
          session,
          fetchedAt
        }), { headers });
      }
    }

    // Idle: surface the last thing played instead of an empty card
    const recent = await getRecent(auth);
    const last = recent[0];

    return new Response(JSON.stringify({
      isPlaying: false,
      lastPlayed: last ? { ...shapeTrack(last.track), playedAt: last.played_at } : null,
      fetchedAt
    }), { headers });
  } catch (error) {
    console.error('now-playing:', error.message);
    return new Response(JSON.stringify({ isPlaying: false, error: error.message }), { status: 500, headers });
  }
};
