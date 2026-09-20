/**
 * GitHub API proxy with edge caching, so visitors never hit GitHub's
 * 60 req/h per-IP limit themselves (shared campus/office NATs burn it fast).
 *
 *   /api/github                      → recent public events for GH_USER
 *   /api/github?user                 → GH_USER's profile (repos, followers)
 *   /api/github?repo=owner/name      → repo metadata
 *   /api/github?releases=owner/name  → releases list
 *   /api/github?commit=owner/name/sha → one commit (cached for a day)
 *   /api/github?contributions        → last year's contribution calendar
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
  const commit = url.searchParams.get('commit');

  if (url.searchParams.has('contributions')) return contributions();

  let upstream;
  let ttl = CACHE_SECONDS;
  if (commit) {
    const m = commit.match(/^([\w-][\w.-]*\/[\w-][\w.-]*)\/([0-9a-f]{7,40})$/);
    if (!m) return json({ error: 'bad commit' }, 400);
    upstream = `${API}/repos/${m[1]}/commits/${m[2]}`;
    ttl = 86400;
  } else if (repo) {
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
    headersOut['Cache-Control'] = `public, max-age=${ttl}`;
    headersOut['Netlify-CDN-Cache-Control'] = `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 4}, durable`;
  } else {
    headersOut['Cache-Control'] = 'no-store'; // never pin a rate-limit error at the edge
  }

  return new Response(body, { status: res.status, headers: headersOut });
};

/**
 * Contribution calendar: { total, days: [{ date, count, level }] }.
 * GraphQL needs a token; without one, read the same public HTML fragment
 * GitHub's own profile page loads.
 */
async function contributions() {
  let days;
  try {
    days = process.env.GITHUB_TOKEN ? await contributionsGraphQL() : await contributionsHTML();
  } catch (error) {
    return json({ error: error.message }, 502);
  }
  const total = days.reduce((n, d) => n + d.count, 0);
  return new Response(JSON.stringify({ total, days, fetchedAt: Date.now() }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=1800',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400, durable'
    }
  });
}

async function contributionsHTML() {
  const res = await fetch(`https://github.com/users/${GH_USER}/contributions`, {
    headers: { 'User-Agent': 'modka.is-a.dev', Accept: 'text/html' }
  });
  if (!res.ok) throw new Error(`contributions ${res.status}`);
  const html = await res.text();

  // <td … data-date="2025-09-21" id="contribution-day-component-0-0" data-level="0">
  // <tool-tip for="contribution-day-component-0-0">4 contributions on September 21st.
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>\s*(\d+|No) contributions?/g)) {
    counts.set(m[1], m[2] === 'No' ? 0 : Number(m[2]));
  }
  const days = [];
  for (const m of html.matchAll(/<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="([^"]+)"[^>]*data-level="(\d)"/g)) {
    days.push({ date: m[1], count: counts.get(m[2]) ?? 0, level: Number(m[3]) });
  }
  if (!days.length) throw new Error('contributions: no calendar found');
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function contributionsGraphQL() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'modka.is-a.dev' },
    body: JSON.stringify({
      query: `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
        weeks { contributionDays { date contributionCount contributionLevel } } } } } }`,
      variables: { login: GH_USER }
    })
  });
  if (!res.ok) throw new Error(`graphql ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
  return data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap(w => w.contributionDays)
    .map(d => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 }));
}

function json(data, status) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
