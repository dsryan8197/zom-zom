import { TIER_COLORS } from './weapons.js';
import { SPECIALS } from './player.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), round: $('round').querySelector('b'), remaining: $('remaining'), inter: $('intermission'),
      score: $('score'), combo: $('combo'), feed: $('feed'), health: $('health-fill'), healthTxt: $('health').querySelector('span'),
      walls: $('walls'), special: $('special'), grenades: $('grenades'), slots: $('slots'), ammo: $('ammo'), wname: $('weapon-name'),
      prompt: $('prompt'), banner: $('banner'), hit: $('hitmarker'), vignette: $('damage-vignette'), cross: $('crosshair'),
      compass: $('compass-strip'), dropMarker: $('drop-marker'), jet: $('jet-fuel'),
    };
    this.mini = $('minimap').getContext('2d');
    this.hitT = 0; this.dmgT = 0; this.bannerT = 0; this.toastT = 0;
    this._slotsDirty = true;
    this._last = {};
    // compass strip: repeated 3x so it can scroll seamlessly
    const labels = ['N', '', '', 'NE', '', '', 'E', '', '', 'SE', '', '', 'S', '', '', 'SW', '', '', 'W', '', '', 'NW', '', ''];
    let html = '';
    for (let r = 0; r < 3; r++) for (let i = 0; i < 24; i++) html += `<span class="${labels[i].length === 1 ? 'c' : ''}">${labels[i] || '·'}</span>`;
    this.el.compass.innerHTML = html;
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }
  slotsDirty() { this._slotsDirty = true; }

  set(key, el, val, prop = 'textContent') {
    if (this._last[key] === val) return;
    this._last[key] = val; el[prop] = val;
  }

  feed(text, cls = '') {
    const d = document.createElement('div');
    d.textContent = text; if (cls) d.className = cls;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 1700);
  }

  toast(text) { this.feed(text, 'combo'); }

  prompt(html) {
    if (html === this._prompt) return;
    this._prompt = html;
    this.el.prompt.style.display = html ? 'block' : 'none';
    if (html) this.el.prompt.innerHTML = html;
  }

  banner(title, sub = '', dur = 3) {
    this.el.banner.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    this.el.banner.style.opacity = 1;
    this.bannerT = dur;
  }

  hitmarker(head) {
    this.el.hit.classList.toggle('head', !!head);
    this.hitT = 0.15;
  }

  damage(amount) { this.dmgT = Math.min(1, this.dmgT + amount / 40); }

  update(dt) {
    const g = this.game, W = g.weapons, P = g.player, E = this.el;
    this.hitT -= dt; E.hit.style.opacity = this.hitT > 0 ? 1 : 0;
    this.dmgT = Math.max(0, this.dmgT - dt * 0.8);
    E.vignette.style.opacity = Math.max(this.dmgT, P.health < 35 ? (35 - P.health) / 50 + Math.sin(g.time * 6) * 0.08 : 0);
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) E.banner.style.opacity = 0; }

    this.set('round', E.round, String(g.round));
    const rem = g.roundTotal - g.killedThisRound;
    this.set('rem', E.remaining, g.intermission > 0 ? '' : `${Math.max(0, rem)} zombies left${g.camping ? ' — <b>MOVE!</b>' : ''}`, 'innerHTML');
    this.set('inter', E.inter, g.intermission > 0 ? `Next round in ${Math.ceil(g.intermission)}` : g.camping ? 'They smell you camping. Keep moving!' : '');
    this.set('score', E.score, g.score.toLocaleString());
    const combo = g.combo >= 2 ? `x${g.combo} COMBO` : '';
    this.set('combo', E.combo, combo);
    E.combo.style.opacity = g.combo >= 2 ? Math.min(1, (g.comboT / 2.2) * 2) : 0;
    const hp = Math.ceil(P.health);
    this.set('hp', E.healthTxt, String(hp));
    E.health.style.width = `${P.health}%`;

    // walls
    const S = g.specials;
    const wallKey = `${S.wallCharges}|${Math.ceil(S.wallRecharge)}`;
    if (this._last.walls !== wallKey) {
      this._last.walls = wallKey;
      let h = '<kbd style="background:#9ad;color:#111;padding:0 5px;border-radius:3px">F</kbd> WALLS ';
      for (let i = 0; i < S.maxWalls; i++) {
        if (i < S.wallCharges) h += '<span class="pip on"></span>';
        else if (i === S.wallCharges) h += `<span class="pip"><span class="fill" style="width:${(1 - S.wallRecharge / S.RECHARGE) * 100}%"></span></span>`;
        else h += '<span class="pip"></span>';
      }
      if (S.wallCharges < S.maxWalls) h += ` <small>${Math.ceil(S.wallRecharge)}s</small>`;
      E.walls.innerHTML = h;
    }
    const sp = P.special;
    const spText = sp ? `<kbd style="background:#7cf3c9;color:#111;padding:0 5px;border-radius:3px">E</kbd> <b>${SPECIALS[sp.id].name}</b>${sp.charges != null ? ` x${sp.charges}` : ''} <small style="opacity:.6">${SPECIALS[sp.id].desc}</small>` : '<span style="opacity:.5">E — no specialty item</span>';
    this.set('sp', E.special, spText, 'innerHTML');
    this.set('gr', E.grenades, `<kbd style="background:#bba;color:#111;padding:0 5px;border-radius:3px">G</kbd> GRENADES x${W.grenades}`, 'innerHTML');
    const jet = sp && sp.id === 'jetpack' && P.jetFuel < 100;
    E.jet.style.display = jet ? 'block' : 'none';
    if (jet) E.jet.firstChild.style.width = `${P.jetFuel}%`;

    // weapon
    const w = W.w;
    if (w) {
      this.set('ammo', E.ammo, `<b>${w.mag}</b> / <span>${w.reserve}</span>`, 'innerHTML');
      this.set('wname', E.wname, W.reloadT > 0 ? 'RELOADING…' : w.def.name);
      E.ammo.style.color = w.mag === 0 ? '#ff5050' : w.mag <= w.def.mag * 0.25 ? '#ffb040' : '#fff';
    }
    if (this._slotsDirty) {
      this._slotsDirty = false;
      E.slots.innerHTML = W.slots.map((s, i) => `<div class="${i === W.cur ? 'active' : ''} t${s ? s.def.tier : 0}">${s ? s.def.name : '— empty —'}<small>${i + 1}</small></div>`).join('');
    }
    E.cross.classList.toggle('ads', W.ads > 0.6);
    const spread = w ? 6 + (w.def.spread || 0.01) * 600 + W.kick * 8 : 8;
    E.cross.style.setProperty('--spread', `${spread}px`);

    // compass
    const deg = ((-P.yaw * 180) / Math.PI + 360) % 360; // 0 = north (-z)
    const px = 30 * 24; // one revolution in px
    E.compass.style.left = `${210 - px - (deg / 360) * px - 15}px`;
    const d = g.drops.drop;
    if (d && !d.opened) {
      const ang = Math.atan2(d.x - P.pos.x, -(d.z - P.pos.z)); // bearing from north, clockwise
      let rel = (ang * 180) / Math.PI - deg; while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
      E.dropMarker.style.display = 'block';
      E.dropMarker.style.left = `${210 + Math.max(-200, Math.min(200, (rel / 360) * px))}px`;
      E.dropMarker.lastChild.textContent = `${Math.round(Math.hypot(d.x - P.pos.x, d.z - P.pos.z))}m`;
    } else E.dropMarker.style.display = 'none';

    this.drawMinimap();
  }

  drawMinimap() {
    const g = this.game, c = this.mini, P = g.player;
    const S = 180, scale = 0.75; // px per metre
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); c.clip();
    c.translate(S / 2, S / 2);
    c.rotate(P.yaw);
    c.scale(scale, scale);
    c.translate(-P.pos.x, -P.pos.z);
    // roads
    c.fillStyle = 'rgba(80,80,80,.7)';
    c.fillRect(-6, -175, 12, 350); c.fillRect(-175, -6, 350, 12);
    // buildings
    for (const b of g.town.buildings) {
      const inside = P.pos.x > b.x0 && P.pos.x < b.x1 && P.pos.z > b.z0 && P.pos.z < b.z1;
      c.fillStyle = inside ? 'rgba(220,200,140,.6)' : 'rgba(200,200,200,.45)';
      c.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    }
    // zombies
    c.fillStyle = '#ff3030';
    for (const z of g.zombies.list) { if (!z.dead) c.fillRect(z.pos.x - 1.5, z.pos.z - 1.5, z.type === 'brute' ? 5 : 3, z.type === 'brute' ? 5 : 3); }
    // pickups
    for (const it of g.pickups.items) {
      if (!it.alive) continue;
      c.fillStyle = it.kind === 'ammo' ? '#d8c040' : it.kind === 'gun' ? '#' + TIER_COLORS[it.data.id ? 2 : 1].toString(16) : '#40ffc0';
      if (it.kind === 'gun') c.fillStyle = '#' + (TIER_COLORS[(g.weaponsDefs[it.data.id] || {}).tier || 2]).toString(16).padStart(6, '0');
      c.fillRect(it.pos.x - 1.2, it.pos.z - 1.2, 2.4, 2.4);
    }
    // turrets / walls
    c.fillStyle = '#60b0ff';
    for (const t of g.specials.turrets) c.fillRect(t.group.position.x - 2, t.group.position.z - 2, 4, 4);
    c.restore();
    // supply drop (clamped to edge)
    const d = g.drops.drop;
    if (d && !d.opened) {
      let dx = (d.x - P.pos.x) * scale, dz = (d.z - P.pos.z) * scale;
      const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
      let rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      const len = Math.hypot(rx, rz), max = S / 2 - 8;
      if (len > max) { rx *= max / len; rz *= max / len; }
      c.fillStyle = '#ff2020'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.fillRect(S / 2 + rx - 5, S / 2 + rz - 5, 10, 10); c.strokeRect(S / 2 + rx - 5, S / 2 + rz - 5, 10, 10);
    }
    // player arrow
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(S / 2, S / 2 - 7); c.lineTo(S / 2 - 5, S / 2 + 5); c.lineTo(S / 2 + 5, S / 2 + 5); c.fill();
  }
}
