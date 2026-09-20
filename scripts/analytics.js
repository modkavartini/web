/**
 * First-party page view counter — one beacon per page load to /api/hit.
 * No cookies, nothing stored in the browser. Skipped for local dev, for
 * browsers sending Global Privacy Control, and when the owner has opted this
 * browser out from /admin.
 */
(() => {
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return;
  if (navigator.globalPrivacyControl) return;
  try { if (localStorage.getItem('modka:no-track')) return; } catch (e) { /* ignore */ }

  const payload = JSON.stringify({ p: location.pathname, r: document.referrer, w: screen.width });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/hit', new Blob([payload], { type: 'application/json' }));
  } else {
    fetch('/api/hit', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
  }
})();
