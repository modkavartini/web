/**
 * GitHub Repository Data Fetcher
 * Fetches stars, language, and latest release for project cards
 */

class GitHubDataFetcher {
    constructor() {
        this.repos = [
            {
                owner: 'modkavartini',
                name: 'catppuccin',
                elementId: 'project-catppuccin',
                fallback: { stars: 150, downloads: 1000, language: 'PowerShell', version: null }
            },
            {
                owner: 'modkavartini',
                name: 'amarena',
                elementId: 'project-amarena',
                fallback: { stars: 45, downloads: 500, language: 'PowerShell', version: null }
            },
            {
                owner: 'modkavartini',
                name: 'klwp',
                elementId: 'project-klwp',
                fallback: { stars: 20, downloads: 100, language: 'KLWP', version: null }
            }
        ];

        this.init();
    }

    async init() {
        // Fetch data for all repos in parallel
        await Promise.all(this.repos.map(repo => this.fetchRepoData(repo)));
    }

    async fetchRepoData(repo) {
        try {
            console.log(`Fetching GitHub data for ${repo.name}...`);

            // Fetch repo info (stars, language)
            const repoResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}`);

            if (!repoResponse.ok) {
                console.warn(`GitHub API error for ${repo.name}: ${repoResponse.status}, using fallback`);
                this.updateProjectCard(repo.elementId, repo.fallback);
                return;
            }

            const repoData = await repoResponse.json();
            console.log(`Got data for ${repo.name}:`, repoData.stargazers_count, repoData.language);

            // Check if data is valid (not rate limited or empty)
            const stars = repoData.stargazers_count;
            const language = repoData.language;

            // If API returned invalid data, use fallback
            if (stars === undefined || stars === null) {
                console.warn(`Invalid API response for ${repo.name}, using fallback`);
                this.updateProjectCard(repo.elementId, repo.fallback);
                return;
            }

            // Fetch all releases for download count and latest version
            let releaseTag = null;
            let totalDownloads = 0;
            try {
                const releasesResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.name}/releases`);
                if (releasesResponse.ok) {
                    const releasesData = await releasesResponse.json();
                    if (releasesData.length > 0) {
                        // Get latest release tag
                        releaseTag = releasesData[0].tag_name;
                        // Sum up all downloads from all releases
                        releasesData.forEach(release => {
                            release.assets.forEach(asset => {
                                totalDownloads += asset.download_count;
                            });
                        });
                    }
                }
            } catch (e) {
                // No releases available
            }

            // Update the UI with real data
            this.updateProjectCard(repo.elementId, {
                stars: stars,
                downloads: totalDownloads || repo.fallback.downloads,
                language: language || repo.fallback.language,
                version: releaseTag
            });

        } catch (error) {
            console.warn(`Failed to fetch data for ${repo.name}:`, error);
            // Use fallback on error
            this.updateProjectCard(repo.elementId, repo.fallback);
        }
    }

    updateProjectCard(elementId, data) {
        const card = document.getElementById(elementId);
        if (!card) return;

        // Update stars
        const starsEl = card.querySelector('.project-card__stars-count');
        if (starsEl) {
            starsEl.textContent = this.formatNumber(data.stars);
        }

        // Update downloads
        const downloadsEl = card.querySelector('.project-card__downloads-count');
        if (downloadsEl) {
            downloadsEl.textContent = this.formatNumber(data.downloads);
        }

        // Update language
        const langEl = card.querySelector('.project-card__language');
        if (langEl) {
            langEl.textContent = data.language;
        }

        // Update version
        const versionEl = card.querySelector('.project-card__version');
        if (versionEl && data.version) {
            versionEl.textContent = data.version;
            versionEl.style.display = 'inline-flex';
        }
    }

    // Format large numbers (e.g., 1500 -> 1.5K)
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
        }
        return num.toString();
    }
}

/**
 * Image Slideshow for project cards with multiple images
 */
class ProjectSlideshow {
    constructor(container) {
        this.container = container;
        this.images = container.querySelectorAll('.project-card__slide');
        this.currentIndex = 0;
        this.interval = null;

        if (this.images.length > 1) {
            this.start();
        }
    }

    start() {
        // Set first image as active
        this.images[0].classList.add('active');

        // Start slideshow
        this.interval = setInterval(() => this.next(), 4000);
    }

    next() {
        // Hide current
        this.images[this.currentIndex].classList.remove('active');

        // Move to next
        this.currentIndex = (this.currentIndex + 1) % this.images.length;

        // Show next
        this.images[this.currentIndex].classList.add('active');
    }
}

/**
 * Roles Loader - Loads roles from JSON
 */
class RolesLoader {
    constructor() {
        this.init();
    }

    async init() {
        try {
            const response = await fetch('/data/roles.json');
            const data = await response.json();
            this.renderRoles(data);
        } catch (error) {
            console.warn('Failed to load roles.json, using static HTML:', error);
        }
    }

    renderRoles(data) {
        const currentContainer = document.getElementById('current-roles-list');
        const pastContainer = document.getElementById('past-roles-list');

        if (currentContainer && data.currentRoles) {
            currentContainer.innerHTML = data.currentRoles.map(role => `
                <div class="role-item">
                    <span class="role-item__title">${role.title}</span>
                    <span style="color: var(--ctp-overlay1);">@</span>
                    ${role.url
                    ? `<a href="${role.url}" target="_blank" rel="noopener" class="role-item__org">${role.organization}</a>`
                    : `<span class="role-item__org" style="color: var(--ctp-overlay1);">${role.organization}</span>`
                }
                </div>
            `).join('');
        }

        if (pastContainer && data.pastRoles) {
            pastContainer.innerHTML = data.pastRoles.map(role => `
                <div class="role-item" style="border-bottom: none; opacity: 0.7;">
                    <span class="role-item__title">${role.title}</span>
                    <span style="color: var(--ctp-overlay1);">@</span>
                    ${role.url
                    ? `<a href="${role.url}" target="_blank" rel="noopener" class="role-item__org">${role.organization}</a>`
                    : `<span class="role-item__org" style="color: var(--ctp-overlay1);">${role.organization}</span>`
                }
                </div>
            `).join('');
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Fetch GitHub data
    new GitHubDataFetcher();

    // Initialize slideshows
    document.querySelectorAll('.project-card__slideshow').forEach(container => {
        new ProjectSlideshow(container);
    });

    // Load roles from JSON
    new RolesLoader();
});
