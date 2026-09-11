/**
 * Now Playing — polls /api/now-playing (a Netlify Function backed by the
 * Spotify Web API), so it shows whatever is playing on any device.
 */

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

  renderPlaying({ track, progress, fetchedAt }) {
    const { title, artist, album, albumArt, url, duration } = track;
    const startedAt = fetchedAt - progress;
    const pct = Math.min((progress / duration) * 100, 100);
    const bars = '<div class="spotify-widget__bar"></div>'.repeat(7);

    this.content.innerHTML = `
      <a class="spotify-widget" href="${url}" target="_blank" rel="noopener" title="Open in Spotify">
        <img src="${albumArt}" alt="${escapeHtml(album)}" class="spotify-widget__art">
        <div class="spotify-widget__info">
          <div class="spotify-widget__song">${escapeHtml(title)}</div>
          <div class="spotify-widget__artist">${escapeHtml(artist)}</div>
          <div class="spotify-widget__progress">
            <div class="spotify-widget__progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="spotify-widget__visualizer">${bars}</div>
        </div>
      </a>
    `;
    this.content.classList.remove('spotify-widget--idle');

    // Advance the bar locally between polls; re-fetch as soon as the track ends
    const fill = this.content.querySelector('.spotify-widget__progress-fill');
    this.tickTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      fill.style.width = `${Math.min((elapsed / duration) * 100, 100)}%`;
      if (elapsed >= duration) this.refresh();
    }, 1000);
  }

  renderIdle(lastPlayed) {
    if (lastPlayed && lastPlayed.title) {
      const { title, artist, album, albumArt, url } = lastPlayed;
      this.content.innerHTML = `
        <a class="spotify-widget spotify-widget--idle" href="${url}" target="_blank" rel="noopener" title="Open in Spotify">
          <img src="${albumArt}" alt="${escapeHtml(album)}" class="spotify-widget__art">
          <div class="spotify-widget__info">
            <div class="spotify-widget__label">Last played</div>
            <div class="spotify-widget__song">${escapeHtml(title)}</div>
            <div class="spotify-widget__artist">${escapeHtml(artist)}</div>
          </div>
        </a>
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

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text ?? '').replace(/[&<>"']/g, c => map[c]);
}

document.addEventListener('DOMContentLoaded', () => {
  window.nowPlaying = new NowPlaying();
});
