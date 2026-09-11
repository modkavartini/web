/**
 * Now Playing — polls /api/now-playing (a Netlify Function backed by the
 * Spotify Web API), so it shows whatever is playing on any device.
 */

const CONTEXT_ICONS = {
  playlist: 'queue_music',
  album: 'album',
  artist: 'person',
  collection: 'favorite',
  show: 'podcasts'
};

class NowPlaying {
  constructor() {
    this.content = document.getElementById('spotify-content');
    this.pollMs = 15000;
    this.pollTimer = null;
    this.tickTimer = null;
    if (!this.content) return;

    this.refresh();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopPolling();
      else this.refresh();
    });
  }

  stopPolling() {
    clearTimeout(this.pollTimer);
    clearInterval(this.tickTimer);
  }

  async refresh() {
    this.stopPolling();
    try {
      const res = await fetch('/api/now-playing', { cache: 'no-store' });
      const data = await res.json();
      this.render(data);
    } catch (error) {
      console.warn('Now playing unavailable:', error);
      this.renderIdle(null);
    }
    if (!document.hidden) this.pollTimer = setTimeout(() => this.refresh(), this.pollMs);
  }

  render(data) {
    if (data.isPlaying && data.track) {
      this.renderPlaying(data);
    } else {
      this.renderIdle(data.lastPlayed);
    }
  }

  renderPlaying({ track, progress, fetchedAt, context, session }) {
    const { title, artist, album, albumArt, url, duration } = track;
    const startedAt = fetchedAt - progress;
    const pct = Math.min((progress / duration) * 100, 100);
    const bars = '<div class="spotify-widget__bar"></div>'.repeat(7);

    this.content.innerHTML = `
      <div class="spotify-widget">
        <a href="${url}" target="_blank" rel="noopener" title="Open in Spotify">
          <img src="${albumArt}" alt="${escapeHtml(album)}" class="spotify-widget__art">
        </a>
        <div class="spotify-widget__info">
          <a href="${url}" target="_blank" rel="noopener" class="spotify-widget__song">${escapeHtml(title)}</a>
          <div class="spotify-widget__artist">${escapeHtml(artist)}</div>
          <div class="spotify-widget__progress">
            <div class="spotify-widget__progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="spotify-widget__visualizer">${bars}</div>
          ${renderMeta(context, session)}
        </div>
      </div>
    `;
    this.content.classList.remove('spotify-widget--idle');

    // Advance the bar + session clock locally between polls; re-fetch when the track ends
    const fill = this.content.querySelector('.spotify-widget__progress-fill');
    const clock = this.content.querySelector('[data-session-start]');
    this.tickTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      fill.style.width = `${Math.min((elapsed / duration) * 100, 100)}%`;
      if (clock) clock.textContent = formatDuration(Date.now() - Number(clock.dataset.sessionStart));
      if (elapsed >= duration) this.refresh();
    }, 1000);
  }

  renderIdle(lastPlayed) {
    if (lastPlayed && lastPlayed.title) {
      const { title, artist, album, albumArt, url } = lastPlayed;
      this.content.innerHTML = `
        <div class="spotify-widget spotify-widget--idle">
          <a href="${url}" target="_blank" rel="noopener" title="Open in Spotify">
            <img src="${albumArt}" alt="${escapeHtml(album)}" class="spotify-widget__art">
          </a>
          <div class="spotify-widget__info">
            <div class="spotify-widget__label">Last played</div>
            <a href="${url}" target="_blank" rel="noopener" class="spotify-widget__song">${escapeHtml(title)}</a>
            <div class="spotify-widget__artist">${escapeHtml(artist)}</div>
          </div>
        </div>
      `;
    } else {
      this.content.innerHTML = `
        <div class="spotify-widget spotify-widget--idle">
          <div style="text-align: center; padding: var(--space-md); width: 100%;">
            <p style="color: var(--ctp-overlay1); font-size: var(--text-sm); margin: 0;">
              Not currently playing
            </p>
          </div>
        </div>
      `;
    }
    this.content.classList.add('spotify-widget--idle');
  }
}

/** "from <playlist>" + "listening for 1h 12m · 18 tracks" */
function renderMeta(context, session) {
  const parts = [];

  if (context && context.name) {
    const icon = CONTEXT_ICONS[context.type] || 'play_circle';
    const inner = `<span class="material-symbols-rounded">${icon}</span><span class="spotify-widget__meta-text">${escapeHtml(context.name)}</span>`;
    parts.push(context.url
      ? `<a href="${context.url}" target="_blank" rel="noopener" class="spotify-widget__meta-item" title="Open in Spotify">${inner}</a>`
      : `<span class="spotify-widget__meta-item">${inner}</span>`);
  }

  if (session && session.startedAt) {
    const tracks = session.tracks > 1 ? ` · ${session.tracks} tracks` : '';
    parts.push(`<span class="spotify-widget__meta-item" title="Listening since ${new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}">
      <span class="material-symbols-rounded">schedule</span>
      <span class="spotify-widget__meta-text"><span data-session-start="${session.startedAt}">${formatDuration(Date.now() - session.startedAt)}</span>${tracks}</span>
    </span>`);
  }

  return parts.length ? `<div class="spotify-widget__meta">${parts.join('')}</div>` : '';
}

function formatDuration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c]);
}

document.addEventListener('DOMContentLoaded', () => {
  window.nowPlaying = new NowPlaying();
});
