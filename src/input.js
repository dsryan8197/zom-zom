// Keyboard / mouse state with per-frame "pressed" edges.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = [false, false, false];
    this.mousePressed = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.sensitivity = 0.0022;
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouse[e.button] = true; this.mousePressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.keys.clear(); this.mouse = [false, false, false]; }
      this.onLockChange?.(this.locked);
    });
  }
  lock() { this.el.requestPointerLock?.(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mousePressed = [false, false, false];
    this.lookDX = this.dx; this.lookDY = this.dy;
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
