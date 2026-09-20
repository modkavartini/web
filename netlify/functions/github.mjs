/**
 * GitHub API proxy with edge caching, so visitors never hit GitHub's
 * 60 req/h per-IP limit themselves (shared campus/office NATs burn it fast).
 *
 *   /api/github                      → recent public events for GH_USER
 *   /api/github?user                 → GH_USER's profile (repos, followers)
 *   /api/github?repo=owner/name      → repo metadata
 *   /api/github?releases=owner/name  → releases list
 *
 * Optional: set GITHUB_TOKEN (a fine-grained token with no permissions is
 * enough) to raise the upstream limit to 5000 req/h.
 */

const GH_USER = 'modkavartini';
const API = 'https://api.github.com';
const CACHE_SECONDS = 300;
const REPO_RE = /^[\w-][\w.-]*\/[\w-][\w.-]*$/; // no leading dots, so no `..` path tricks

export default async (req) => {
  const url = new URL(req.url);
  const repo = url.searchParams.get('repo');
  const releases = url.searchParams.get('releases');

  let upstream;
  if (repo) {
    if (!REPO_RE.test(repo)) return json({ error: 'bad repo' }, 400);
    upstream = `${API}/repos/${repo}`;
  } else if (releases) {
    if (!REPO_RE.test(releases)) return json({ error: 'bad repo' }, 400);
    upstream = `${API}/repos/${releases}/releases?per_page=5`;
  } else if (url.searchParams.has('user')) {
    upstream = `${API}/users/${GH_USER}`;
  } else {
    upstream = `${API}/users/${GH_USER}/events/public?per_page=30`;
  }

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'modka.is-a.dev',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const res = await fetch(upstream, { headers });
  const body = await res.text();

  const headersOut = { 'Content-Type': 'application/json', 'X-Upstream-Remaining': res.headers.get('x-ratelimit-remaining') ?? '' };
  if (res.ok) {
    // browser: 5 min; Netlify edge: 5 min, then refresh in the background
    headersOut['Cache-Control'] = `public, max-age=${CACHE_SECONDS}`;
    headersOut['Netlify-CDN-Cache-Control'] = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 4}, durable`;
  } else {
    headersOut['Cache-Control'] = 'no-store'; // never pin a rate-limit error at the edge
  }

  return new Response(body, { status: res.status, headers: headersOut });
};

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
