/**
 * GitHub contribution graph — the familiar grid of squares, drawn from
 * /api/github?contributions (a cached proxy, see netlify/functions/github.mjs).
 * Shows as many weeks as fit the card; resizes with it. Below it, the
 * repos pushed to most recently.
 */

const REPO_COUNT = 5;
const LANG_COLORS = {
  JavaScript: 'var(--ctp-yellow)', TypeScript: 'var(--ctp-blue)', PowerShell: 'var(--ctp-sapphire)',
  Python: 'var(--ctp-blue)', Lua: 'var(--ctp-lavender)', HTML: 'var(--ctp-peach)', CSS: 'var(--ctp-mauve)',
  'C++': 'var(--ctp-pink)', C: 'var(--ctp-subtext0)', Shell: 'var(--ctp-green)', Rust: 'var(--ctp-maroon)',
  Go: 'var(--ctp-teal)', Java: 'var(--ctp-peach)', Kotlin: 'var(--ctp-mauve)', Dart: 'var(--ctp-sky)'
};

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
    this.repos = document.getElementById('github-repos');
    this.reposSection = document.getElementById('github-repos-section');
    if (!this.content) return;
    this.init();
  }

  async init() {
    try {
      const [calendar, user, repos] = await Promise.all([this.loadCalendar(), this.loadUser(), this.loadRepos()]);
      this.calendar = calendar;
      this.renderStats(user);
      this.renderSummary(calendar);
      this.renderGrid();
      this.renderRepos(repos);
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

  async loadRepos() {
    try {
      const res = await fetch('/api/github?repos');
      return res.ok ? await res.json() : [];
    } catch (e) { return []; }
  }

  renderRepos(repos) {
    if (!this.repos) return;
    const recent = repos.filter(r => !r.fork && !r.archived).slice(0, REPO_COUNT);
    if (!recent.length) return; // section stays hidden
    if (this.reposSection) this.reposSection.hidden = false;
    this.repos.innerHTML = recent.map(r => `
      <a href="${r.html_url}" target="_blank" rel="noopener" class="github-repo" title="${escapeAttr(r.description || r.name)}">
        <span class="github-repo__main">
          <span class="github-repo__name">${escapeHtml(r.name)}</span>
          ${r.description ? `<span class="github-repo__desc">${escapeHtml(r.description)}</span>` : ''}
        </span>
        <span class="github-repo__meta">
          ${r.language ? `<span class="github-repo__lang" style="--lang:${LANG_COLORS[r.language] || 'var(--ctp-overlay0)'}">${escapeHtml(r.language)}</span>` : ''}
          ${r.stargazers_count ? `<span><span class="material-symbols-rounded">star</span>${r.stargazers_count}</span>` : ''}
          <span title="Last push ${new Date(r.pushed_at).toLocaleDateString()}">${timeAgo(r.pushed_at)}</span>
        </span>
      </a>
    `).join('');
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

function timeAgo(iso) {
  const d = Math.max(0, (Date.now() - Date.parse(iso)) / 86400000);
  if (d < 1) return 'today';
  if (d < 7) return `${Math.floor(d)}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c]);
}
const escapeAttr = escapeHtml;

const longDay = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

document.addEventListener('DOMContentLoaded', () => {
  window.githubActivity = new GitHubActivity();
});
