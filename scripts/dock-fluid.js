/**
 * Ferrofluid highlight for the socials dock.
 *
 * A mauve "body" fills the held pill. It creeps toward the neighbouring pill
 * (slowing as it nears the edge), snaps across with a spring overshoot, leaves
 * a droplet behind that gets absorbed, and ripples inside the new pill until it
 * settles. Every jump rolls fresh timings, overshoot, tendril thickness,
 * droplet size and ripple frequencies, so no two look alike.
 *
 * Direction: right until the last pill, then back left, and so on.
 * Hover: the fluid moves to whatever pill is hovered and stays while hovered;
 * the sweep resumes when the pointer leaves.
 *
 * Shapes are DOM blobs merged by an SVG goo filter (blur + alpha threshold).
 */

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutBack = (t, s) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

class DockFluid {
  constructor(dock) {
    this.dock = dock;
    this.links = Array.from(dock.querySelectorAll('.contact-dock__link'));
    if (this.links.length < 2) return;

    this.layer = document.createElement('div');
    this.layer.className = 'contact-dock__fluid';
    this.layer.setAttribute('aria-hidden', 'true');
    dock.prepend(this.layer);

    this.body = this.blob();
    this.neck = this.blob();     // thin bridge that keeps the tendril attached
    this.tendril = this.blob();
    this.drop = this.blob();
    this.ripples = Array.from({ length: 4 }, () => this.blob());

    dock.classList.add('has-fluid');
    this.links.forEach(l => l.classList.remove('contact-dock__link--primary'));

    this.index = 0;
    this.dir = 1;
    this.hoverIndex = null;

    this.measure();
    new ResizeObserver(() => this.measure()).observe(dock);

    this.links.forEach((link, i) => {
      link.addEventListener('pointerenter', () => { this.hoverIndex = i; });
      link.addEventListener('pointerleave', () => { this.hoverIndex = null; this.phaseStart = performance.now(); });
    });

    this.setHeld(0);
    this.startDwell(performance.now(), 0.4);
    requestAnimationFrame((t) => this.tick(t));
  }

  blob() {
    const el = document.createElement('div');
    el.className = 'contact-dock__blob';
    this.layer.appendChild(el);
    return el;
  }

  /** Pill geometry relative to the fluid layer. */
  measure() {
    const origin = this.layer.getBoundingClientRect();
    this.boxes = this.links.map(link => {
      const r = link.getBoundingClientRect();
      return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
    });
  }

  setHeld(i) {
    this.links.forEach((l, k) => l.classList.toggle('is-held', k === i));
  }

  // ---------- phases ----------

  startDwell(now, rippleEnergy) {
    const box = this.boxes[this.index];
    this.phase = 'dwell';
    this.phaseStart = now;
    this.dwellFor = rand(1600, 3000);
    this.rippleEnergy = rippleEnergy; // 1 after a landing, lower on first paint
    this.settleAmp = rand(0.06, 0.12) * rippleEnergy;
    this.settleFreq = rand(0.010, 0.016);
    // a fresh ripple pattern each time the fluid lands
    this.rippleSet = this.ripples.map(() => ({
      r: rand(0.22, 0.34) * box.h,
      theta: rand(0, Math.PI * 2),
      phi: rand(0, Math.PI * 2),
      omega: rand(0.0015, 0.0035) * (Math.random() < 0.5 ? 1 : -1),
      nu: rand(0.002, 0.005),
      reach: rand(0.55, 0.95)
    }));
    this.activeRipples = 2 + Math.floor(Math.random() * 3); // 2-4
  }

  startApproach(now, target, quick) {
    this.phase = 'approach';
    this.phaseStart = now;
    this.from = this.index;
    this.to = target;
    this.approachFor = quick ? rand(420, 700) : rand(1300, 2300);
    const box = this.boxes[this.from];
    this.tendrilR = rand(0.26, 0.42) * box.h;
    this.lead = rand(5, 14);
  }

  startJump(now) {
    this.phase = 'jump';
    this.phaseStart = now;
    this.jumpFor = rand(280, 460);
    this.overshoot = rand(1.2, 2.1);
    this.dropR = rand(0.26, 0.38) * this.boxes[this.from].h;
    this.dropLinger = this.jumpFor * rand(1.3, 2.0);
    this.heldSwitched = false;
  }

  /** Next pill in the sweep, bouncing at both ends. */
  nextIndex() {
    let next = this.index + this.dir;
    if (next >= this.links.length || next < 0) {
      this.dir = -this.dir;
      next = this.index + this.dir;
    }
    return next;
  }

  // ---------- frame ----------

  tick(now) {
    const t = now - this.phaseStart;

    if (this.phase === 'dwell') this.renderDwell(t, now);
    else if (this.phase === 'approach') this.renderApproach(t, now);
    else if (this.phase === 'jump') this.renderJump(t, now);

    requestAnimationFrame((n) => this.tick(n));
  }

  renderDwell(t, now) {
    const box = this.boxes[this.index];

    // settle: the pill breathes after a landing, then calms
    const settle = this.settleAmp * Math.exp(-t / 420) * Math.cos(t * this.settleFreq * 2 * Math.PI);
    this.place(this.body, box.x, box.y, box.w, box.h, 1 + settle, 1 - settle * 0.6);
    this.hide(this.tendril);
    this.hide(this.neck);
    this.drawRipples(t, box);

    // hover pulls the fluid; otherwise sweep after the dwell
    if (this.hoverIndex !== null && this.hoverIndex !== this.index) {
      this.startApproach(now, this.hoverIndex, true);
    } else if (this.hoverIndex === null && t > this.dwellFor) {
      this.startApproach(now, this.nextIndex(), false);
    }
  }

  renderApproach(t, now) {
    const from = this.boxes[this.from];
    const to = this.boxes[this.to];
    const p = easeOutQuint(clamp01(t / this.approachFor)); // fast start, slow near the edge
    const sign = Math.sign(to.x - from.x) || 1;

    // body leans toward the target and stretches a touch
    this.place(this.body, from.x + sign * this.lead * p, from.y, from.w, from.h, 1 + 0.06 * p, 1 - 0.04 * p);

    // tendril reaches across the gap, stopping just short of the next pill
    const r = this.tendrilR;
    const startX = sign > 0 ? from.x + from.w - r : from.x + r;
    const endX = sign > 0 ? to.x + r * 0.6 : to.x + to.w - r * 0.6;
    const cx = lerp(startX, endX, p);
    const cy = lerp(from.y + from.h / 2, to.y + to.h / 2, easeInOutSine(p));
    const thin = 1 - 0.35 * Math.sin(p * Math.PI); // necks in mid-stretch
    this.placeCircle(this.tendril, cx, cy, r * thin);

    // neck from the body's edge to the tip; the goo filter tapers it into a spike
    const neckH = r * 2 * thin * (1 - 0.45 * p);
    this.placeRect(this.neck, Math.min(startX, cx), cy - neckH / 2, Math.abs(cx - startX), neckH);

    this.drawRipples(t + 5000, from, 0.35);

    if (t >= this.approachFor) this.startJump(now);
  }

  renderJump(t, now) {
    const from = this.boxes[this.from];
    const to = this.boxes[this.to];
    const p = clamp01(t / this.jumpFor);
    const q = easeOutBack(p, this.overshoot);

    // the whole body snaps across, overshooting then springing back
    const x = lerp(from.x, to.x, q);
    const y = lerp(from.y, to.y, easeInOutSine(p));
    const w = lerp(from.w, to.w, p);
    const stretch = 1 + 0.25 * Math.sin(p * Math.PI);
    this.place(this.body, x, y, w, to.h, stretch, 1 / Math.sqrt(stretch));
    this.drawRipples(t + 5000, { x, y, w, h: to.h }, 0.3); // satellites ride along

    // tendril is swallowed by the arriving body
    const sign = Math.sign(to.x - from.x) || 1;
    const tendrilX = sign > 0 ? to.x + this.tendrilR * 0.6 : to.x + to.w - this.tendrilR * 0.6;
    this.placeCircle(this.tendril, tendrilX, to.y + to.h / 2, this.tendrilR * (1 - p));

    // droplet left on the old pill, pulled back in and gone
    const dt = clamp01(t / this.dropLinger);
    const dropX = sign > 0 ? from.x + from.w - this.dropR : from.x + this.dropR;
    this.placeCircle(this.drop, dropX - sign * dt * 6, from.y + from.h / 2, this.dropR * (1 - Math.pow(dt, 2.5))); // lingers, then pulled in

    // the thread between droplet and body thins and snaps early in the jump
    const snap = clamp01(p / 0.4);
    const trailX = sign > 0 ? x : x + w;
    const neckH = this.dropR * 1.4 * (1 - snap);
    this.placeRect(this.neck, Math.min(dropX, trailX), from.y + from.h / 2 - neckH / 2, Math.abs(trailX - dropX), neckH);

    if (!this.heldSwitched && q >= 0.5) { // when the body is physically past halfway
      this.heldSwitched = true;
      this.setHeld(this.to);
    }

    if (t >= this.jumpFor && dt >= 1) {
      this.index = this.to;
      this.hide(this.drop);
      this.startDwell(now, 1);
    }
  }

  /** Satellites that bulge the pill's edge; energy decays after a landing. */
  drawRipples(t, box, ceiling = 1) {
    const energy = Math.min(ceiling, 0.3 + (this.rippleEnergy - 0.3) * Math.exp(-t / 1100));
    this.ripples.forEach((el, k) => {
      if (k >= this.activeRipples) { this.hide(el); return; }
      const s = this.rippleSet[k];
      const cx = box.x + box.w / 2 + Math.cos(s.theta + s.omega * t) * (box.w / 2 - s.r * 0.5) * s.reach;
      const cy = box.y + box.h / 2 + Math.sin(s.phi + s.nu * t) * (box.h / 2) * 0.75 * energy;
      this.placeCircle(el, cx, cy, s.r * (0.7 + 0.3 * energy));
    });
  }

  // ---------- drawing ----------

  place(el, x, y, w, h, sx = 1, sy = 1) {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate(${x}px, ${y}px) scale(${sx}, ${sy})`;
    el.style.opacity = '1';
  }

  placeRect(el, x, y, w, h) {
    if (w <= 0.5 || h <= 0.5) { this.hide(el); return; }
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.opacity = '1';
  }

  placeCircle(el, cx, cy, r) {
    if (r <= 0.5) { this.hide(el); return; }
    const d = r * 2;
    el.style.width = `${d}px`;
    el.style.height = `${d}px`;
    el.style.transform = `translate(${cx - r}px, ${cy - r}px)`;
    el.style.opacity = '1';
  }

  hide(el) {
    el.style.opacity = '0';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const dock = document.querySelector('.contact-dock');
  if (!dock) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // keeps the static mauve pill
  window.dockFluid = new DockFluid(dock);
});
