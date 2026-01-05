/**
 * modkavartini Portfolio - Main Application
 * Handles page initialization, animations, and interactivity
 */

// Scroll to top on page refresh
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Scroll to top (backup)
    window.scrollTo(0, 0);

    // Initialize staggered animations
    initStaggeredAnimations();

    // Initialize smooth scrolling
    initSmoothScroll();

    // Initialize hover effects
    initHoverEffects();

    // Initialize parallax on mouse move (subtle)
    initParallaxEffect();

    // Initialize icon sparkle effect
    initIconSparkle();

    // Initialize random quote bubble
    initRandomQuote();
}

/**
 * Load and display a random quote from quotes.txt
 */
async function initRandomQuote() {
    const quoteText = document.getElementById('quote-text');
    if (!quoteText) return;

    try {
        const response = await fetch('quotes.txt');
        if (!response.ok) throw new Error('Failed to load quotes');

        const text = await response.text();
        const quotes = text.split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0);

        if (quotes.length === 0) {
            quoteText.textContent = '...';
            return;
        }

        // Pick a random quote
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        quoteText.textContent = `"${randomQuote}"`;

        // Optionally rotate quotes every 10 seconds
        setInterval(() => {
            const newQuote = quotes[Math.floor(Math.random() * quotes.length)];
            quoteText.style.opacity = '0';
            setTimeout(() => {
                quoteText.textContent = `"${newQuote}"`;
                quoteText.style.opacity = '1';
            }, 300);
        }, 10000);

    } catch (error) {
        console.warn('Could not load quotes:', error);
        quoteText.textContent = '"efficiency is my passion."';
    }
}

/**
 * Trigger staggered fade-in animations on page load
 */
function initStaggeredAnimations() {
    const staggeredElements = document.querySelectorAll('[class*="stagger-"]');

    // Use Intersection Observer for scroll-based animations
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animationPlayState = 'running';
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    staggeredElements.forEach(el => {
        el.style.animationPlayState = 'paused';
        observer.observe(el);
    });

    // Trigger hero animations immediately
    const heroElements = document.querySelectorAll('.bento-grid:first-of-type [class*="stagger-"]');
    heroElements.forEach(el => {
        el.style.animationPlayState = 'running';
    });
}

/**
 * Smooth scroll for anchor links
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

/**
 * Enhanced hover effects for widgets
 */
function initHoverEffects() {
    const widgets = document.querySelectorAll('.widget');

    widgets.forEach(widget => {
        widget.addEventListener('mouseenter', () => {
            // Pause float animation on hover for stability
            widget.style.animationPlayState = 'paused';
        });

        widget.addEventListener('mouseleave', () => {
            widget.style.animationPlayState = 'running';
        });
    });
}

/**
 * Subtle parallax effect on mouse move
 */
function initParallaxEffect() {
    const floatingElements = document.querySelectorAll('.float, .float-gentle, .float-delayed');

    // Only enable on non-touch devices and if not reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = 'ontouchstart' in window;

    if (prefersReducedMotion || isTouchDevice) return;

    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    function animateParallax() {
        // Smooth interpolation
        currentX += (mouseX - currentX) * 0.05;
        currentY += (mouseY - currentY) * 0.05;

        floatingElements.forEach((el, index) => {
            const intensity = 3 + (index % 3) * 2; // Vary intensity
            const x = currentX * intensity;
            const y = currentY * intensity;

            // Apply as additional transform
            el.style.setProperty('--parallax-x', `${x}px`);
            el.style.setProperty('--parallax-y', `${y}px`);
        });

        requestAnimationFrame(animateParallax);
    }

    // Add CSS variable support
    const style = document.createElement('style');
    style.textContent = `
    .float, .float-gentle, .float-delayed {
      transform: translateX(var(--parallax-x, 0)) translateY(var(--parallax-y, 0));
    }
  `;
    document.head.appendChild(style);

    animateParallax();
}

/**
 * Random sparkle effect on Material icons
 */
function initIconSparkle() {
    const icons = document.querySelectorAll('.widget__icon .material-symbols-rounded');

    if (icons.length === 0) return;

    // Add sparkle keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes icon-sparkle {
            0%, 100% {
                color: inherit;
                text-shadow: none;
            }
            50% {
                color: var(--ctp-mauve);
                text-shadow: 
                    0 0 10px var(--ctp-mauve),
                    0 0 20px rgba(203, 166, 247, 0.5),
                    0 0 30px rgba(203, 166, 247, 0.3);
            }
        }
        
        .icon-sparkling {
            animation: icon-sparkle 0.6s ease-in-out;
        }
    `;
    document.head.appendChild(style);

    // Sparkle a specific icon
    function sparkleIcon(icon) {
        icon.classList.add('icon-sparkling');
        setTimeout(() => {
            icon.classList.remove('icon-sparkling');
        }, 600);
    }

    // Trigger random sparkles more frequently
    function triggerSparkle() {
        // Pick 1-2 random icons to sparkle at once
        const numSparkles = Math.random() > 0.5 ? 2 : 1;

        for (let i = 0; i < numSparkles; i++) {
            const randomIndex = Math.floor(Math.random() * icons.length);
            sparkleIcon(icons[randomIndex]);
        }

        // Schedule next sparkle with very short delay (0.3-0.8 seconds)
        const nextDelay = 300 + Math.random() * 500;
        setTimeout(triggerSparkle, nextDelay);
    }

    // Start sparkling immediately
    setTimeout(triggerSparkle, 300);
}

/**
 * Format time in mm:ss
 */
function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Debounce helper
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Export utilities for use in other scripts
window.appUtils = {
    formatTime,
    debounce
};
