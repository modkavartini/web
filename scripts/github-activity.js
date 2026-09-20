/**
 * GitHub contribution graph — the familiar grid of squares, drawn from
 * /api/github?contributions (a cached proxy, see netlify/functions/github.mjs).
 * Shows as many weeks as fit the card; resizes with it.
 */

const GH_CACHE_KEY = 'modka:github-contributions';
const GH_CACHE_MS = 30 * 60 * 1000;
const CELL = 11;   // px
const GAP = 3;     // px
const STEP = CELL + GAP;

class GitHubActivity {
  constructor() {
    this.content = document.getElementById('github-activity');
    this.stats = document.getElementById('github-stats');
    this.summary = document.getElementById('github-summary');
    if (!this.content) return;
    this.init();
  }

  async init() {
    try {
      const [calendar, user] = await Promise.all([this.loadCalendar(), this.loadUser()]);
      this.calendar = calendar;
      this.renderStats(user);
      this.renderSummary(calendar);
      this.renderGrid();
      let t;
      new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => this.renderGrid(), 100); }).observe(this.content);
    } catch (error) {
      console.warn('GitHub contributions unavailable:', error);
      this.content.innerHTML = '<p class="github-event__empty">Contributions are taking a nap</p>';
    }
  }

  async loadCalendar() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(GH_CACHE_KEY));
      if (cached && Date.now() - cached.at < GH_CACHE_MS) return cached.data;
    } catch (e) { /* ignore */ }
    const res = await fetch('/api/github?contributions');
    if (!res.ok) throw new Error(`contributions ${res.status}`);
    const data = await res.json();
    try { sessionStorage.setItem(GH_CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (e) { /* ignore */ }
    return data;
  }

  async loadUser() {
    try {
      const res = await fetch('/api/github?user');
      return res.ok ? await res.json() : null;
    } catch (e) { return null; }
  }

  renderStats(user) {
    if (!this.stats || !user) return;
    this.stats.innerHTML = `
      <span class="github-stats__item"><span class="material-symbols-rounded">deployed_code</span>${user.public_repos} repos</span>
      <span class="github-stats__item"><span class="material-symbols-rounded">group</span>${user.followers} followers</span>
    `;
  }

  renderSummary({ total, days }) {
    if (!this.summary) return;
    // current streak: consecutive active days ending today (or yesterday, if today is still empty)
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) streak++;
      else if (i === days.length - 1) continue;
      else break;
    }
    this.summary.innerHTML = `
      <strong>${total.toLocaleString()}</strong> contribution${total === 1 ? '' : 's'} in the last year
      ${streak > 1 ? `<span class="github-summary__sep">·</span><strong>${streak}</strong> day streak` : ''}
    `;
  }

  renderGrid() {
    const { days } = this.calendar;
    const width = this.content.clientWidth;
    if (!width || width === this.lastWidth) return; // the observer also fires on our own height changes
    this.lastWidth = width;

    // One column per week (Sun–Sat), newest on the right; keep as many as fit
    const weeks = [];
    let week = [];
    for (const d of days) {
      const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
      if (dow === 0 && week.length) { weeks.push(week); week = []; }
      if (!week.length) week = new Array(dow).fill(null); // pad the first week
      week.push(d);
    }
    if (week.length) weeks.push(week);

    const fit = Math.min(weeks.length, Math.max(4, Math.floor((width + GAP) / STEP)));
    const shown = weeks.slice(-fit);
    // grow the cells a touch so the grid fills the card edge to edge
    const step = Math.floor((width + GAP) / fit);
    const cell = step - GAP;
    const w = shown.length * step - GAP;
    const monthRow = 14;
    const h = monthRow + 7 * step - GAP;

    // Month label above the first column of each month
    let lastMonth = -1;
    const months = shown.map((wk, x) => {
      const first = wk.find(Boolean);
      if (!first) return '';
      const date = new Date(first.date + 'T00:00:00Z');
      if (date.getUTCMonth() === lastMonth) return '';
      lastMonth = date.getUTCMonth();
      if (x === 0 && wk.length < 7) return ''; // partial first column: skip, avoids a cramped label
      if (x >= shown.length - 2) return '';    // no room to the right
      return `<text class="github-graph__month" x="${x * step}" y="9">${date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</text>`;
    }).join('');

    const cells = shown.map((wk, x) => wk.map((d, y) => {
      if (!d) return '';
      const label = `${d.count === 0 ? 'No' : d.count} contribution${d.count === 1 ? '' : 's'} on ${longDay(d.date)}`;
      return `<rect class="github-graph__day" data-level="${d.level}" x="${x * step}" y="${monthRow + y * step}" width="${cell}" height="${cell}" rx="2"><title>${label}</title></rect>`;
    }).join('')).join('');

    this.content.innerHTML = `<svg class="github-graph" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="GitHub contribution graph">${months}${cells}</svg>`;
  }
}

const longDay = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

document.addEventListener('DOMContentLoaded', () => {
  window.githubActivity = new GitHubActivity();
});
