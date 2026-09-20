/**
 * GitHub Activity — recent public events for the profile, via /api/github
 * (a cached proxy, see netlify/functions/github.mjs). Results are also kept
 * in sessionStorage so navigating around doesn't re-fetch.
 */

const GH_USER = 'modkavartini';
const GH_EVENTS_URL = '/api/github';
const GH_USER_URL = '/api/github?user';
const GH_CACHE_KEY = 'modka:github-activity';
const GH_CACHE_MS = 5 * 60 * 1000;
const GH_MAX_ITEMS = 4;

class GitHubActivity {
  constructor() {
    this.content = document.getElementById('github-activity');
    this.stats = document.getElementById('github-stats');
    if (!this.content) return;
    this.init();
  }

  async init() {
    try {
      const data = await this.load();
      this.render(data);
    } catch (error) {
      console.warn('GitHub activity unavailable:', error);
      this.renderEmpty('Activity is taking a nap');
    }
  }

  async load() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(GH_CACHE_KEY));
      if (cached && Date.now() - cached.at < GH_CACHE_MS) return cached;
    } catch (e) { /* ignore */ }

    const [eventsRes, userRes] = await Promise.all([fetch(GH_EVENTS_URL), fetch(GH_USER_URL)]);
    if (!eventsRes.ok) throw new Error(`events ${eventsRes.status}`);
    const events = await eventsRes.json();
    const user = userRes.ok ? await userRes.json() : null;

    const items = events
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .map(describeEvent)
      .filter(Boolean)
      .slice(0, GH_MAX_ITEMS);

    // The public feed omits commit messages, so look up the head commit of each push
    await Promise.all(items.filter(i => i.commit).map(async (item) => {
      try {
        const res = await fetch(`/api/github?commit=${item.commit}`);
        if (res.ok) item.detail = firstLine((await res.json()).commit?.message);
      } catch (e) { /* leave it without a detail line */ }
    }));

    const data = {
      at: Date.now(),
      items,
      user: user ? { repos: user.public_repos, followers: user.followers } : null
    };
    try { sessionStorage.setItem(GH_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    return data;
  }

  render({ items, user }) {
    if (this.stats && user) {
      this.stats.innerHTML = `
        <span class="github-stats__item"><span class="material-symbols-rounded">deployed_code</span>${user.repos} repos</span>
        <span class="github-stats__item"><span class="material-symbols-rounded">group</span>${user.followers} followers</span>
      `;
    }

    if (!items.length) { this.renderEmpty('Quiet on GitHub lately'); return; }

    this.content.innerHTML = items.map(item => `
      <a href="${item.url}" target="_blank" rel="noopener" class="github-event">
        <span class="github-event__icon"><span class="material-symbols-rounded">${item.icon}</span></span>
        <span class="github-event__body">
          <span class="github-event__text">${item.text}</span>
          ${item.detail ? `<span class="github-event__detail">${escapeHtml(item.detail)}</span>` : ''}
        </span>
        <time class="github-event__time" datetime="${item.at}" title="${new Date(item.at).toLocaleString()}">${timeAgo(item.at)}</time>
      </a>
    `).join('');
  }

  renderEmpty(message) {
    this.content.innerHTML = `<p class="github-event__empty">${message}</p>`;
  }
}

/** Turn a raw event into { icon, text (html), detail, url, at } — or null to skip it. */
function describeEvent(event) {
  const repo = event.repo.name;
  const repoUrl = `https://github.com/${repo}`;
  const shortRepo = repo.startsWith(`${GH_USER}/`) ? repo.slice(GH_USER.length + 1) : repo;
  const name = `<strong>${escapeHtml(shortRepo)}</strong>`;
  const p = event.payload || {};
  const base = { at: event.created_at, url: repoUrl, detail: null };

  switch (event.type) {
    case 'PushEvent': {
      const branch = String(p.ref || '').replace('refs/heads/', '');
      return {
        ...base,
        icon: 'commit',
        text: `Pushed to ${name}${branch && branch !== 'main' && branch !== 'master' ? ` <span class="github-event__branch">${escapeHtml(branch)}</span>` : ''}`,
        commit: p.head ? `${repo}/${p.head}` : null,
        url: p.head ? `${repoUrl}/commit/${p.head}` : `${repoUrl}/commits`
      };
    }
    case 'CreateEvent':
      if (p.ref_type === 'repository') return { ...base, icon: 'add_box', text: `Created ${name}` };
      if (p.ref_type === 'branch') return { ...base, icon: 'fork_right', text: `Created branch <strong>${escapeHtml(p.ref)}</strong> in ${name}`, url: `${repoUrl}/tree/${p.ref}` };
      if (p.ref_type === 'tag') return { ...base, icon: 'sell', text: `Tagged <strong>${escapeHtml(p.ref)}</strong> in ${name}`, url: `${repoUrl}/releases/tag/${p.ref}` };
      return null;
    case 'PullRequestEvent': {
      const pr = p.pull_request || {};
      const merged = p.action === 'merged' || (p.action === 'closed' && pr.merged);
      const verb = merged ? 'Merged' : p.action === 'closed' ? 'Closed' : (p.action === 'opened' || p.action === 'reopened') ? 'Opened' : null;
      if (!verb) return null;
      return { ...base, icon: merged ? 'merge' : 'call_merge', text: `${verb} PR <strong>#${pr.number}</strong> in ${name}`, detail: pr.title, url: pr.html_url || `${repoUrl}/pulls` };
    }
    case 'IssuesEvent': {
      const issue = p.issue || {};
      if (!['opened', 'closed', 'reopened'].includes(p.action)) return null;
      const verb = p.action[0].toUpperCase() + p.action.slice(1);
      return { ...base, icon: 'adjust', text: `${verb} issue <strong>#${issue.number}</strong> in ${name}`, detail: issue.title, url: issue.html_url || `${repoUrl}/issues` };
    }
    case 'IssueCommentEvent': {
      const issue = p.issue || {};
      if (p.action !== 'created') return null;
      return { ...base, icon: 'chat_bubble', text: `Commented on <strong>#${issue.number}</strong> in ${name}`, detail: issue.title, url: p.comment?.html_url || issue.html_url || repoUrl };
    }
    case 'ReleaseEvent':
      if (p.action !== 'published') return null;
      return { ...base, icon: 'rocket_launch', text: `Released <strong>${escapeHtml(p.release?.tag_name ?? '')}</strong> of ${name}`, detail: p.release?.name, url: p.release?.html_url || `${repoUrl}/releases` };
    case 'WatchEvent':
      return { ...base, icon: 'star', text: `Starred ${name}` };
    case 'ForkEvent':
      return { ...base, icon: 'fork_left', text: `Forked ${name}`, url: p.forkee?.html_url || repoUrl };
    case 'PublicEvent':
      return { ...base, icon: 'public', text: `Open-sourced ${name}` };
    default:
      return null;
  }
}

function firstLine(message) {
  const line = String(message ?? '').split('\n')[0].trim();
  return line.length > 72 ? `${line.slice(0, 71)}…` : line;
}

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d`;
  const w = d / 7; if (w < 5) return `${Math.floor(w)}w`;
  return `${Math.floor(d / 30)}mo`;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c]);
}

document.addEventListener('DOMContentLoaded', () => {
  window.githubActivity = new GitHubActivity();
});
