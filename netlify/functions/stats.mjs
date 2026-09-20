/**
 * Aggregated analytics for the /admin dashboard.
 *
 *   GET /api/stats?days=30   (Authorization: Bearer <ANALYTICS_KEY>)
 *
 * Finished days are rolled up once into days/<day> and served from there;
 * today is always computed live from its hits.
 */

import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';

const LIVE_WINDOW_MS = 5 * 60 * 1000;
const MAX_DAYS = 90;

export default async (req) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

  const key = process.env.ANALYTICS_KEY;
  if (!key) {
    return json({ error: 'ANALYTICS_KEY is not set. Run: npx netlify env:set ANALYTICS_KEY <a-long-random-string>' }, 503, headers);
  }
  if (!authorized(req.headers.get('authorization'), key)) {
    return json({ error: 'Unauthorized' }, 401, headers);
  }

  const url = new URL(req.url);
  const days = Math.min(MAX_DAYS, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const store = getStore('analytics');
  const today = dayKey(new Date());

  const dayKeys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(dayKey(d));
  }

  let liveVisitors = 0;
  const series = await Promise.all(dayKeys.map(async (day) => {
    if (day !== today) {
      const rolled = await store.get(`days/${day}`, { type: 'json' });
      if (rolled) return rolled;
    }
    const hits = await loadHits(store, day);
    const summary = summarize(day, hits);
    if (day !== today) {
      await store.setJSON(`days/${day}`, summary);
    } else {
      const since = Date.now() - LIVE_WINDOW_MS;
      liveVisitors = new Set(hits.filter(h => h.t >= since).map(h => h.v)).size;
    }
    return summary;
  }));

  const totals = { views: 0, visitors: 0, pages: {}, refs: {}, countries: {}, devices: {}, hours: new Array(24).fill(0) };
  for (const s of series) {
    totals.views += s.views;
    totals.visitors += s.visitors;
    merge(totals.pages, s.pages);
    merge(totals.refs, s.refs);
    merge(totals.countries, s.countries);
    merge(totals.devices, s.devices);
    s.hours.forEach((n, h) => { totals.hours[h] += n; });
  }

  return json({
    range: { days, from: dayKeys[0], to: today },
    live: liveVisitors,
    totals: {
      ...totals,
      pages: top(totals.pages, 8),
      refs: top(totals.refs, 8),
      countries: top(totals.countries, 8),
      devices: top(totals.devices, 4)
    },
    series: series.map(({ day, views, visitors }) => ({ day, views, visitors })),
    generatedAt: Date.now()
  }, 200, headers);
};

async function loadHits(store, day) {
  const { blobs } = await store.list({ prefix: `hits/${day}/` });
  const hits = [];
  // Read in batches so a busy day doesn't open hundreds of connections at once
  for (let i = 0; i < blobs.length; i += 25) {
    const batch = await Promise.all(blobs.slice(i, i + 25).map(b => store.get(b.key, { type: 'json' })));
    hits.push(...batch.filter(Boolean));
  }
  return hits;
}

function summarize(day, hits) {
  const s = { day, views: hits.length, visitors: 0, pages: {}, refs: {}, countries: {}, devices: {}, hours: new Array(24).fill(0) };
  const visitors = new Set();
  for (const h of hits) {
    visitors.add(h.v);
    bump(s.pages, h.p);
    bump(s.refs, h.r || 'direct');
    bump(s.countries, h.c || '??');
    bump(s.devices, h.d || 'desktop');
    s.hours[new Date(h.t).getUTCHours()] += 1;
  }
  s.visitors = visitors.size;
  return s;
}

const bump = (map, k) => { map[k] = (map[k] || 0) + 1; };
const merge = (into, from) => { for (const [k, v] of Object.entries(from || {})) into[k] = (into[k] || 0) + v; };
const top = (map, n) => Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
const dayKey = (d) => d.toISOString().slice(0, 10);

function authorized(header, key) {
  const token = (header || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token), b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}
