import { setVolume } from './audio.js';

// Volume + mouse sensitivity, saved per browser.
const KEY = 'zomzom-settings';
const DEFAULTS = { volume: 80, sensitivity: 1 };

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}
function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }

export class Settings {
  constructor(input) {
    this.input = input;
    this.values = load();
    const $ = (id) => document.getElementById(id);
    this.el = { panel: $('settings'), vol: $('set-volume'), volVal: $('set-volume-val'), sens: $('set-sens'), sensVal: $('set-sens-val') };
    this.el.vol.value = this.values.volume;
    this.el.sens.value = this.values.sensitivity;
    this.el.vol.oninput = () => { this.values.volume = +this.el.vol.value; this.apply(); save(this.values); };
    this.el.sens.oninput = () => { this.values.sensitivity = +this.el.sens.value; this.apply(); save(this.values); };
    $('settings-btn').onclick = (e) => { e.stopPropagation(); this.open(); };
    $('settings-back').onclick = (e) => { e.stopPropagation(); this.close(); };
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.isOpen) this.close(); });
    this.apply();
  }

  get isOpen() { return !this.el.panel.classList.contains('hidden'); }
  open() { this.el.panel.classList.remove('hidden'); }
  close() { this.el.panel.classList.add('hidden'); }

  apply() {
    const v = this.values;
    this.input.sensitivity = 0.0022 * v.sensitivity;
    setVolume(v.volume / 100);
    this.el.volVal.textContent = `${v.volume}%`;
    this.el.sensVal.textContent = `${v.sensitivity.toFixed(2)}x`;
  }
}
