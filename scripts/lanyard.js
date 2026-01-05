/**
 * Lanyard Integration for Discord & Spotify
 * Uses the Lanyard API (api.lanyard.rest) for real-time Discord presence
 */

class LanyardClient {
  constructor(userId) {
    this.userId = userId;
    this.socket = null;
    this.heartbeatInterval = null;
    this.data = null;
    this.listeners = [];
    
    // DOM elements
    this.elements = {
      discordAvatar: document.getElementById('discord-avatar'),
      discordUsername: document.getElementById('discord-username'),
      discordStatusDot: document.getElementById('discord-status-dot'),
      discordStatusText: document.getElementById('discord-status-text'),
      discordActivity: document.getElementById('discord-activity'),
      discordActivityText: document.getElementById('discord-activity-text'),
      spotifyWidget: document.getElementById('spotify-widget'),
      spotifyContent: document.getElementById('spotify-content')
    };
  }
  
  connect() {
    // First, try REST API for initial data
    this.fetchInitialData();
    
    // Then connect WebSocket for real-time updates
    this.connectWebSocket();
  }
  
  async fetchInitialData() {
    try {
      const response = await fetch(`https://api.lanyard.rest/v1/users/${this.userId}`);
      const data = await response.json();
      
      if (data.success) {
        this.updatePresence(data.data);
      }
    } catch (error) {
      console.warn('Lanyard REST API error:', error);
    }
  }
  
  connectWebSocket() {
    try {
      this.socket = new WebSocket('wss://api.lanyard.rest/socket');
      
      this.socket.onopen = () => {
        console.log('Lanyard WebSocket connected');
      };
      
      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };
      
      this.socket.onclose = () => {
        console.log('Lanyard WebSocket disconnected, reconnecting...');
        clearInterval(this.heartbeatInterval);
        setTimeout(() => this.connectWebSocket(), 5000);
      };
      
      this.socket.onerror = (error) => {
        console.warn('Lanyard WebSocket error:', error);
      };
    } catch (error) {
      console.warn('Failed to connect to Lanyard WebSocket:', error);
    }
  }
  
  handleMessage(message) {
    const { op, d } = message;
    
    switch (op) {
      case 1: // Hello
        this.startHeartbeat(d.heartbeat_interval);
        this.sendInit();
        break;
        
      case 0: // Event
        if (d) {
          this.updatePresence(d);
        }
        break;
    }
  }
  
  startHeartbeat(interval) {
    this.heartbeatInterval = setInterval(() => {
      this.send({ op: 3 });
    }, interval);
  }
  
  sendInit() {
    this.send({
      op: 2,
      d: {
        subscribe_to_id: this.userId
      }
    });
  }
  
  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }
  
  updatePresence(data) {
    this.data = data;
    
    // Update Discord presence
    this.updateDiscordWidget(data);
    
    // Update Spotify widget
    this.updateSpotifyWidget(data.spotify, data.listening_to_spotify);
    
    // Notify listeners
    this.listeners.forEach(listener => listener(data));
  }
  
  updateDiscordWidget(data) {
    const { elements } = this;
    
    if (!elements.discordStatusDot) return;
    
    // Update status dot
    const statusClasses = {
      online: 'status-dot--online',
      idle: 'status-dot--idle',
      dnd: 'status-dot--dnd',
      offline: 'status-dot--offline'
    };
    
    elements.discordStatusDot.className = 'status-dot ' + (statusClasses[data.discord_status] || statusClasses.offline);
    
    // Update status text
    const statusTexts = {
      online: 'Online',
      idle: 'Away',
      dnd: 'Do Not Disturb',
      offline: 'Offline'
    };
    
    if (elements.discordStatusText) {
      elements.discordStatusText.textContent = statusTexts[data.discord_status] || 'Offline';
    }
    
    // Update avatar
    if (elements.discordAvatar && data.discord_user) {
      const avatarUrl = data.discord_user.avatar
        ? `https://cdn.discordapp.com/avatars/${data.discord_user.id}/${data.discord_user.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(data.discord_user.discriminator) % 5}.png`;
      elements.discordAvatar.src = avatarUrl;
    }
    
    // Update username
    if (elements.discordUsername && data.discord_user) {
      elements.discordUsername.textContent = data.discord_user.global_name || data.discord_user.username;
    }
    
    // Update activity
    if (elements.discordActivity && elements.discordActivityText) {
      const activities = data.activities?.filter(a => a.type !== 2) || []; // Exclude Spotify (type 2)
      
      if (activities.length > 0) {
        const activity = activities[0];
        let activityText = '';
        
        switch (activity.type) {
          case 0: // Playing
            activityText = `Playing <span class="discord-widget__activity-name">${activity.name}</span>`;
            break;
          case 1: // Streaming
            activityText = `Streaming <span class="discord-widget__activity-name">${activity.name}</span>`;
            break;
          case 3: // Watching
            activityText = `Watching <span class="discord-widget__activity-name">${activity.name}</span>`;
            break;
          case 4: // Custom
            activityText = activity.state || activity.name;
            break;
          case 5: // Competing
            activityText = `Competing in <span class="discord-widget__activity-name">${activity.name}</span>`;
            break;
          default:
            activityText = activity.name;
        }
        
        elements.discordActivityText.innerHTML = activityText;
        elements.discordActivity.style.display = 'block';
      } else {
        elements.discordActivity.style.display = 'none';
      }
    }
  }
  
  updateSpotifyWidget(spotify, isListening) {
    const { elements } = this;
    
    if (!elements.spotifyContent) return;
    
    if (isListening && spotify) {
      // Calculate progress
      const now = Date.now();
      const elapsed = now - spotify.timestamps.start;
      const duration = spotify.timestamps.end - spotify.timestamps.start;
      const progress = Math.min((elapsed / duration) * 100, 100);
      
      elements.spotifyContent.innerHTML = `
        <div class="spotify-widget">
          <img src="${spotify.album_art_url}" alt="${spotify.album}" class="spotify-widget__art">
          <div class="spotify-widget__info">
            <div class="spotify-widget__song">${spotify.song}</div>
            <div class="spotify-widget__artist">${spotify.artist}</div>
            <div class="spotify-widget__progress">
              <div class="spotify-widget__progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="spotify-widget__visualizer">
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
              <div class="spotify-widget__bar"></div>
            </div>
          </div>
        </div>
      `;
      
      elements.spotifyContent.classList.remove('spotify-widget--idle');
      
      // Start progress update interval
      this.startSpotifyProgress(spotify);
    } else {
      elements.spotifyContent.innerHTML = `
        <div class="spotify-widget spotify-widget--idle">
          <div style="text-align: center; padding: var(--space-md); width: 100%;">
            <p style="color: var(--ctp-overlay1); font-size: var(--text-sm); margin: 0;">
              Not currently playing
            </p>
          </div>
        </div>
      `;
      elements.spotifyContent.classList.add('spotify-widget--idle');
    }
  }
  
  startSpotifyProgress(spotify) {
    // Clear any existing interval
    if (this.spotifyProgressInterval) {
      clearInterval(this.spotifyProgressInterval);
    }
    
    // Update progress every second
    this.spotifyProgressInterval = setInterval(() => {
      const progressFill = document.querySelector('.spotify-widget__progress-fill');
      if (progressFill && spotify) {
        const now = Date.now();
        const elapsed = now - spotify.timestamps.start;
        const duration = spotify.timestamps.end - spotify.timestamps.start;
        const progress = Math.min((elapsed / duration) * 100, 100);
        
        progressFill.style.width = `${progress}%`;
        
        // Stop if track ended
        if (progress >= 100) {
          clearInterval(this.spotifyProgressInterval);
        }
      }
    }, 1000);
  }
  
  onUpdate(listener) {
    this.listeners.push(listener);
  }
}

// Initialize Lanyard client when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const lanyard = new LanyardClient('944986926400811008');
  lanyard.connect();
  
  // Expose for debugging
  window.lanyard = lanyard;
});
