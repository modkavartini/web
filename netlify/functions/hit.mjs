/**
 * Records one page view. Called by scripts/analytics.js via sendBeacon.
 *
 * Privacy: no cookies, no fingerprint stored. The visitor id is a salted
 * SHA-256 of (day, IP, user agent) — it can't be reversed, and it rotates
 * daily, so uniqueness is only ever "unique today".
 *
 * Storage: one small blob per hit under hits/<day>/…, which is append-only
 * (so concurrent hits never overwrite each other). stats.mjs rolls finished
 * days up into days/<day>.
 */

import { getStore } from '@netlify/blobs';

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|monitor|curl|wget|python-requests|facebookexternalhit|whatsapp|telegram|discord/i;

export default async (req, context) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });

  const ua = req.headers.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return new Response(null, { status: 204 });

  let body;
  try { body = await req.json(); } catch { return new Response(null, { status: 400 }); }

  const path = typeof body.p === 'string' && body.p.startsWith('/') ? body.p.slice(0, 200) : '/';
  const width = Number(body.w) || 0;

  // Only keep the referrer's host, and never count ourselves
  let ref = null;
  try {
    const u = new URL(body.r);
    const own = new URL(req.url).hostname;
    if (u.hostname && u.hostname !== own && !u.hostname.endsWith('.netlify.app')) ref = u.hostname.replace(/^www\./, '');
  } catch { /* no referrer */ }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const ip = context.ip || req.headers.get('x-nf-client-connection-ip') || '';
  const salt = process.env.ANALYTICS_SALT || process.env.ANALYTICS_KEY || 'modka';
  const visitor = await sha256(`${salt}|${day}|${ip}|${ua}`);

  const hit = {
    t: now.getTime(),
    p: path,
    r: ref,
    c: context.geo?.country?.code || null,
    v: visitor.slice(0, 16),
    d: /mobile|android|iphone|ipad/i.test(ua) || (width && width < 768) ? 'mobile' : 'desktop'
  };

  const store = getStore('analytics');
  await store.setJSON(`hits/${day}/${hit.t}-${Math.random().toString(36).slice(2, 8)}`, hit);

  return new Response(null, { status: 204 });
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
