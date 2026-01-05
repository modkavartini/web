/**
 * Letter Swap Animation with Spring Physics
 * Animates "Vodka Martini" ↔ "modkavartini" with continuous looping
 * Smooth crossfade between states
 */

class LetterSwapAnimation {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        // Spring physics parameters - softer for smoother animation
        this.spring = {
            stiffness: 120,
            damping: 14,
            mass: 1
        };

        // Animation state
        this.letters = [];
        this.isAnimating = false;
        this.isSwapped = false;

        this.init();
    }

    init() {
        this.parseLetters();
        // Add transition to container for smooth crossfades
        this.container.style.transition = 'opacity 0.5s ease-in-out';
        // Start animation loop after a delay
        setTimeout(() => this.startLoop(), 2000);
    }

    parseLetters() {
        this.letters = [];
        const letterElements = this.container.querySelectorAll('.letter');

        letterElements.forEach((el, index) => {
            // Add smooth transition to each letter
            el.style.transition = 'transform 0.05s linear, color 0.3s ease';
            this.letters.push({
                element: el,
                originalIndex: index,
                currentX: 0,
                targetX: 0,
                velocityX: 0,
                char: el.textContent
            });
        });
    }

    startLoop() {
        this.runSwapAnimation();
    }

    runSwapAnimation() {
        if (this.isAnimating) return;

        this.isAnimating = true;

        // Re-parse letters in case they've been replaced
        this.parseLetters();

        // Find the swapping letters
        const firstLetter = this.letters[0];
        const secondLetter = this.isSwapped ? this.letters[5] : this.letters[6];

        if (!firstLetter || !secondLetter) {
            this.isAnimating = false;
            return;
        }

        // Get positions
        const firstRect = firstLetter.element.getBoundingClientRect();
        const secondRect = secondLetter.element.getBoundingClientRect();

        // Calculate swap distances
        const distance = secondRect.left - firstRect.left;

        // Set targets for swap
        firstLetter.targetX = distance;
        secondLetter.targetX = -distance;

        // Add highlight class with smooth transition
        firstLetter.element.classList.add('highlight');
        secondLetter.element.classList.add('highlight');

        // Start physics simulation
        this.animate(firstLetter, secondLetter);
    }

    animate(firstLetter, secondLetter) {
        const dt = 1 / 60;
        let stillAnimating = false;

        [firstLetter, secondLetter].forEach(letter => {
            if (!letter || (letter.targetX === 0 && letter.currentX === 0)) return;

            // Spring physics calculation
            const displacement = letter.targetX - letter.currentX;
            const springForce = displacement * this.spring.stiffness;
            const dampingForce = letter.velocityX * this.spring.damping;
            const acceleration = (springForce - dampingForce) / this.spring.mass;

            letter.velocityX += acceleration * dt;
            letter.currentX += letter.velocityX * dt;

            // Apply transform
            letter.element.style.transform = `translateX(${letter.currentX}px)`;

            // Check if still moving (with tighter threshold for smoother ending)
            if (Math.abs(displacement) > 0.5 || Math.abs(letter.velocityX) > 0.5) {
                stillAnimating = true;
            }
        });

        if (stillAnimating) {
            requestAnimationFrame(() => this.animate(firstLetter, secondLetter));
        } else {
            this.onAnimationComplete();
        }
    }

    onAnimationComplete() {
        // Toggle state
        this.isSwapped = !this.isSwapped;
        this.isAnimating = false;

        // Smooth crossfade transition
        this.container.style.opacity = '0';
        this.container.style.transform = 'scale(0.98)';

        setTimeout(() => {
            // Set the appropriate text based on state
            if (this.isSwapped) {
                // Show modkavartini (no space)
                this.container.innerHTML = `
                    <span class="letter highlight">m</span><span class="letter">o</span><span class="letter">d</span><span class="letter">k</span><span class="letter">a</span><span class="letter highlight">v</span><span class="letter">a</span><span class="letter">r</span><span class="letter">t</span><span class="letter">i</span><span class="letter">n</span><span class="letter">i</span>
                `.trim();
            } else {
                // Show Vodka Martini (with space)
                this.container.innerHTML = `
                    <span class="letter highlight">V</span><span class="letter">o</span><span class="letter">d</span><span class="letter">k</span><span class="letter">a</span><span class="letter" style="opacity: 0.3;">&nbsp;</span><span class="letter highlight">M</span><span class="letter">a</span><span class="letter">r</span><span class="letter">t</span><span class="letter">i</span><span class="letter">n</span><span class="letter">i</span>
                `.trim();
            }

            // Fade back in with scale
            requestAnimationFrame(() => {
                this.container.style.opacity = '1';
                this.container.style.transform = 'scale(1)';
            });

            // Schedule next animation (pause for 3.5 seconds before swapping again)
            setTimeout(() => {
                this.runSwapAnimation();
            }, 3500);

        }, 500);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const swapAnimation = new LetterSwapAnimation('letter-swap-container');
    window.letterSwap = swapAnimation;
});
