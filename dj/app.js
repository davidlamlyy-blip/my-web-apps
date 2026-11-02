'use strict';
/* DJ-24 UI: knobs, hotkeys, decks, library, queue, auto-mix */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = clampN;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = (s, tenth = true) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + (tenth ? Math.min(59.9, r).toFixed(1) : Math.floor(r));
};
const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const other = id => (id === 'A' ? 'B' : 'A');

let toastTimer;
window.toast = msg => {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
};
const setStatus = html => { $('#status').innerHTML = html; };

Engine.init();
const decks = Engine.decks;
const ui = { A: {}, B: {} };
const knobs = {};            // 'A.gain' → knob
const knobByCode = {};       // 'Digit1' → knob
let selKnob = null;
const queue = [];
let localTracks = [];

/* ================= Knobs ================= */
function makeKnob(parent, cfg) {
  const k = { ...cfg, value: cfg.def };
  const w = document.createElement('div'); w.className = 'kw';
  w.innerHTML = `<div class="knob"><i></i></div><span class="kl">${cfg.label}</span><span class="kv"></span><kbd>${cfg.key.toUpperCase()}</kbd>`;
  parent.appendChild(w);
  k.el = w; const dial = $('.knob', w), kv = $('.kv', w);
  k.set = (v, silent) => {
    k.value = clamp(v, k.min, k.max);
    const ang = -135 + 270 * (k.value - k.min) / (k.max - k.min);
    dial.style.setProperty('--a', ang + 'deg');
    kv.textContent = k.fmt(k.value);
    if (!silent) k.on(k.value);
  };
  k.nudge = (dir, mult) => k.set(k.value + dir * mult * (k.max - k.min) / 40);
  k.select = () => {
    if (selKnob) selKnob.el.classList.remove('sel');
    selKnob = k; w.classList.add('sel');
    setStatus(`▶ <b>${esc(k.name)}</b> — ↑/↓ to turn (Shift coarse, Alt fine) · now ${esc(k.fmt(k.value))}`);
  };
  let drag = null;
  dial.addEventListener('pointerdown', e => { k.select(); drag = { y: e.clientY, v: k.value }; dial.setPointerCapture(e.pointerId); });
  dial.addEventListener('pointermove', e => { if (drag) k.set(drag.v + (drag.y - e.clientY) / 160 * (k.max - k.min)); });
  dial.addEventListener('pointerup', () => { drag = null; });
  dial.addEventListener('wheel', e => { e.preventDefault(); k.select(); k.nudge(e.deltaY < 0 ? 1 : -1, 0.5); }, { passive: false });
  dial.addEventListener('dblclick', () => k.set(k.def));
  k.set(cfg.def, true);
  knobs[cfg.id] = k;
  const code = /^\d$/.test(cfg.key) ? 'Digit' + cfg.key : 'Key' + cfg.key.toUpperCase();
  knobByCode[code] = k;
  return k;
}
const eqFmt = v => (v <= -0.98 ? '-∞' : (v < 0 ? (v * 26).toFixed(0) : '+' + (v * 6).toFixed(0))) + ' dB';
const filtFmt = v => (Math.abs(v) < 0.02 ? 'OFF' : (v < 0 ? 'LP ' : 'HP ') + Math.round(Math.abs(v) * 100) + '%');
const tempoFmt = v => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

/* ================= Decks ================= */
function buildDeck(id) {
  const D = decks[id], isA = id === 'A';
  const root = document.createElement('section');
  root.className = 'deck ' + id; root.id = 'deck-' + id;
  const kc = isA ? ['play', 'cue', 'sync', 'loop', 'brake'] : ['play', 'cue', 'sync', 'loop', 'brake'];
  const hk = isA ? { play: 'Q', cue: 'W', sync: 'E', loop: 'R', brake: 'Z' } : { play: 'U', cue: 'I', sync: 'O', loop: 'P', brake: 'X' };
  root.innerHTML = `
    <div class="lcd">
      <div class="lcd-top"><span class="tag">DECK ${id}</span><span class="src" data-f="src">EMPTY</span><span class="bpm"><b data-f="bpm">---</b> BPM</span></div>
      <div class="lcd-main"><img class="art" data-f="art" hidden alt=""><div class="meta"><div class="title" data-f="title">Load a track from the library</div><div class="artist" data-f="artist">—</div></div></div>
      <canvas class="wave" width="720" height="110" data-f="wave"></canvas>
      <canvas class="scope" width="720" height="70" data-f="scope"></canvas>
      <div class="lcd-bot"><span data-f="elapsed">0:00.0</span><span data-f="tempo">+0.0%</span><span data-f="remain">-0:00.0</span></div>
    </div>
    <div class="deckrow">
      <div class="platter"><div class="vinyl" data-f="vinyl"><div class="label"></div></div></div>
      <div class="transport">
        <button class="btn play" data-act="play"><i></i>PLAY<kbd>${hk.play}</kbd></button>
        <button class="btn" data-act="cue">CUE<kbd>${hk.cue}</kbd></button>
        <button class="btn" data-act="sync"><i></i>SYNC<kbd>${hk.sync}</kbd></button>
        <button class="btn" data-act="loop"><i></i>LOOP<kbd>${hk.loop}</kbd></button>
        <button class="btn" data-act="brake">BRAKE<kbd>${hk.brake}</kbd></button>
        <button class="btn" data-act="eject">EJECT</button>
      </div>
    </div>
    <div class="gridrow"><span>BEAT GRID</span>
      <button data-g="-" title="Shift grid earlier 10 ms (Shift = 2 ms)">◀</button><button data-g="+" title="Shift grid later 10 ms (Shift = 2 ms)">▶</button>
      <button data-g="set" title="Make the current playhead position beat 1">SET 1 HERE</button>
      <button data-g="half" title="BPM ÷ 2">½</button><button data-g="dbl" title="BPM × 2">×2</button>
      <span class="gv" data-f="gv"></span></div>
    <div class="knobs" data-f="knobs"></div>`;
  $('#slot-' + id).replaceWith(root);
  const f = ui[id].f = {};
  $$('[data-f]', root).forEach(el => { f[el.dataset.f] = el; });
  ui[id].root = root; ui[id].angle = 0;
  ui[id].btn = {}; $$('[data-act]', root).forEach(b => { ui[id].btn[b.dataset.act] = b; });

  const keys = isA ? ['1', '2', '3', '4', '5', 'T'] : ['6', '7', '8', '9', '0', 'Y'];
  const specs = [
    { k: 'gain', label: 'GAIN', min: 0, max: 1.5, def: 1, fmt: v => Math.round(v * 100) + '%', on: v => D.setGain(v) },
    { k: 'high', label: 'HI', min: -1, max: 1, def: 0, fmt: eqFmt, on: v => D.setEq('high', v) },
    { k: 'mid', label: 'MID', min: -1, max: 1, def: 0, fmt: eqFmt, on: v => D.setEq('mid', v) },
    { k: 'low', label: 'LOW', min: -1, max: 1, def: 0, fmt: eqFmt, on: v => D.setEq('low', v) },
    { k: 'filter', label: 'FILTER', min: -1, max: 1, def: 0, fmt: filtFmt, on: v => D.setFilter(v) },
    { k: 'tempo', label: 'TEMPO', min: -0.12, max: 0.12, def: 0, fmt: tempoFmt, on: v => { D.syncOn = false; D.setTempo(1 + v); } },
  ];
  specs.forEach((s, i) => makeKnob(f.knobs, { ...s, id: id + '.' + s.k, key: keys[i], name: `Deck ${id} ${s.label}` }));

  // buttons
  const act = {
    play: () => playDeck(id),
    sync: () => toggleSync(id),
    loop: () => { if (D.kind !== 'local') return toast('Loop works on Local/Demo tracks only'); D.toggleLoop(4); },
    brake: () => { if (D.kind !== 'local') return toast('Brake works on Local/Demo tracks only'); D.brake(); },
    eject: () => { D.unload(); refreshDeckStatic(id); },
  };
  Object.entries(act).forEach(([k, fn]) => ui[id].btn[k].addEventListener('click', () => { Engine.resume(); fn(); }));
  const cueB = ui[id].btn.cue;
  cueB.addEventListener('pointerdown', () => { Engine.resume(); D.cuePress(); });
  ['pointerup', 'pointerleave'].forEach(ev => cueB.addEventListener(ev, () => D.cueRelease()));
  $$('[data-g]', root).forEach(b => b.addEventListener('click', e => {
    if (D.kind !== 'local') return toast('Beat grid needs a Local/Demo track');
    const g = b.dataset.g, step = e.shiftKey ? 0.002 : 0.01, bl = D.beatLen;
    if (g === '-') D.setGrid(D.grid - step);
    else if (g === '+') D.setGrid(D.grid + step);
    else if (g === 'set' && bl) { const p = D.position() % bl; D.setGrid(p); }
    else if (g === 'half') D.setBpm(D.bpm / 2);
    else if (g === 'dbl') D.setBpm(D.bpm * 2);
  }));
  f.wave.addEventListener('click', e => {
    if (!D.kind) return;
    const r = f.wave.getBoundingClientRect();
    D.seek((e.clientX - r.left) / r.width * D.duration);
  });
}

function refreshDeckStatic(id) {
  const D = decks[id], f = ui[id].f, t = D.track;
  setText(f.src, !D.kind ? 'EMPTY' : D.kind === 'spotify' ? 'SPOTIFY · FADER ONLY' : (t.demo ? 'DEMO' : 'LOCAL'));
  setText(f.title, t ? t.title : 'Load a track from the library');
  setText(f.artist, t ? (t.artist || '—') : '—');
  if (t && t.artBig) { f.art.src = t.artBig; f.art.hidden = false; } else f.art.hidden = true;
  const kn = ['high', 'mid', 'low', 'filter', 'tempo'];
  const fxOk = D.kind !== 'spotify';
  kn.forEach(n => knobs[id + '.' + n].el.style.opacity = fxOk ? 1 : 0.35);
  ['sync', 'loop', 'brake'].forEach(b => { ui[id].btn[b].disabled = !fxOk; });
}

async function loadToDeck(id, track, autoplay = false) {
  Engine.resume();
  const D = decks[id], O = decks[other(id)];
  try {
    if (track.type === 'spotify') {
      if (!Spotify.connected) throw new Error('Connect Spotify first');
      if (!Spotify.ready) throw new Error('Spotify player not ready (Premium account needed for playback)');
      if (O.kind === 'spotify') { O.unload(); refreshDeckStatic(other(id)); toast(`One Spotify stream at a time — Deck ${other(id)} unloaded`); }
      D.loadSpotify(track);
      knobs[id + '.tempo'].set(0, true); D.setTempo(1);
    } else {
      let buf = track.buffer;
      if (!buf) { toast('Decoding ' + track.title + '…'); buf = await Engine.ctx.decodeAudioData(await track.file.arrayBuffer()); }
      if (!track.bpm) { const r = await detectBpm(buf); track.bpm = r.bpm; track.grid = r.grid; }
      track.dur = buf.duration * 1000;
      D.loadBuffer(buf, track);
      knobs[id + '.tempo'].set(0, true); D.setTempo(1);
    }
    refreshDeckStatic(id);
    setStatus(`Deck ${id} ← <b>${esc(track.title)}</b>${track.bpm ? ' · ' + track.bpm + ' BPM' : ''}`);
    if (autoplay) D.play();
    return true;
  } catch (e) {
    toast('Load failed: ' + e.message); console.error(e); return false;
  }
}

/* ---- SYNC: tempo match + beat-phase lock to the other deck (Local/Demo tracks only) ---- */
function beatDiff(D, L) {            // beats D must move forward to line up with L (-0.5..0.5)
  let d = L.beatPhase() - D.beatPhase(); d -= Math.round(d); return d;
}
function alignPhase(D, L) {
  const d = beatDiff(D, L) * D.beatLen;
  if (D.playing) D.seek(D.position() + d); else D.offset = clamp(D.offset + d, 0, D.duration);
}
function matchTempo(D, L) {
  const want = L.curBpm / D.bpm, c = clamp(want, 0.88, 1.12);
  D.setTempo(c); knobs[D.id + '.tempo'].set(c - 1, true);
  if (c !== want) toast(`Deck ${D.id} hit the ±12% tempo limit`);
}
function toggleSync(id) {
  const D = decks[id], L = decks[other(id)];
  if (D.syncOn) { D.syncOn = false; return toast(`Deck ${id} sync off`); }
  if (D.kind !== 'local' || L.kind !== 'local' || !D.bpm || !L.bpm) return toast('SYNC needs two Local/Demo tracks that both have a BPM');
  L.syncOn = false; D.syncOn = true;
  matchTempo(D, L);
  if (D.playing && L.playing) alignPhase(D, L);
  toast(`Deck ${id} locked to Deck ${L.id} — ${D.curBpm.toFixed(1)} BPM, beats aligned. Turning TEMPO unlocks.`);
}
function playDeck(id) {
  const D = decks[id], L = decks[other(id)];
  if (!D.playing && D.syncOn && L.playing && L.kind === 'local') { matchTempo(D, L); alignPhase(D, L); }
  D.toggle();
}
setInterval(() => {
  for (const id of ['A', 'B']) {
    const D = decks[id], L = decks[other(id)];
    if (!D.syncOn) continue;
    if (D.kind !== 'local' || L.kind !== 'local' || !L.bpm) { D.syncOn = false; continue; }
    if (D.braking || L.braking) continue;
    const base = clamp(L.curBpm / D.bpm, 0.88, 1.12);
    let corr = 0;
    if (D.playing && L.playing) corr = clamp(beatDiff(D, L) * 0.06, -0.01, 0.01);
    D.setTempo(base * (1 + corr)); knobs[id + '.tempo'].set(base - 1, true);
  }
}, 100);

/* ================= Mixer ================= */
function buildMixer() {
  const xf = $('#xf');
  xf.addEventListener('input', () => { cancelFade(); Engine.setXf(parseFloat(xf.value)); updateXfLabel(); });
  $$('[data-cut]').forEach(b => b.addEventListener('click', () => setCrossfader(parseFloat(b.dataset.cut))));
  makeKnob($('#mixk'), { id: 'master', label: 'MASTER', key: 'M', name: 'Master volume', min: 0, max: 1, def: 0.8, fmt: v => Math.round(v * 100) + '%', on: v => Engine.setMaster(v) });
  makeKnob($('#mixk'), { id: 'fxamt', label: 'FX AMT', key: 'V', name: 'FX amount', min: 0, max: 1, def: 0.5, fmt: v => Math.round(v * 100) + '%', on: v => Engine.setFxAmount(v) });
  const fxs = [['echo', 'ECHO', 'A'], ['reverb', 'REVERB', 'S'], ['flanger', 'FLANGE', 'D'], ['crush', 'CRUSH', 'F'], ['gate', 'GATE', 'G']];
  const pads = $('#fxpads');
  fxs.forEach(([n, l, k]) => {
    const p = document.createElement('button'); p.className = 'pad'; p.dataset.fx = n; p.innerHTML = `${l}<kbd>${k}</kbd>`;
    p.addEventListener('pointerdown', e => { Engine.resume(); p.setPointerCapture(e.pointerId); Engine.setFx(n, true); });
    ['pointerup', 'pointercancel'].forEach(ev => p.addEventListener(ev, () => Engine.setFx(n, false)));
    pads.appendChild(p);
  });
  Engine.fxListener = (n, on) => $(`.pad[data-fx=${n}]`).classList.toggle('on', on);
  $('#btn-auto').addEventListener('click', toggleAuto);
}
function updateXfLabel() { setText($('#mix-state'), 'XFADE ' + Math.round(Engine.xf * 100) + '%'); }
function setCrossfader(x) { cancelFade(); Engine.setXf(x); $('#xf').value = Engine.xf; updateXfLabel(); }

let fadeTimer = null;
function cancelFade() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; } }
function fadeTo(target, secs) {
  return new Promise(res => {
    cancelFade();
    const x0 = Engine.xf, t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
      Engine.setXf(x0 + (target - x0) * k); $('#xf').value = Engine.xf; updateXfLabel();
      if (k >= 1) { cancelFade(); res(); }
    }, 40);
  });
}

/* ================= Auto-mix ================= */
const mix = { on: false, busy: false };
function toggleAuto() {
  mix.on = !mix.on; $('#btn-auto').classList.toggle('on', mix.on);
  toast(mix.on ? 'Auto-mix ON — plays the queue, crossfading near each track end' : 'Auto-mix OFF');
  if (mix.on && !decks.A.playing && !decks.B.playing && queue.length) startQueue();
}
async function startQueue() {
  const t = queue.shift(); renderQueue();
  if (await loadToDeck('A', t, true)) setCrossfader(0);
}
async function autoMixTick() {
  if (!mix.on || mix.busy) return;
  const playing = ['A', 'B'].filter(i => decks[i].playing && !decks[i].braking);
  if (playing.length === 0) { if (queue.length && !decks.A.playing && !decks.B.playing && decks.A.position() === 0 && decks.B.position() === 0 && !decks.A.kind && !decks.B.kind) startQueue(); return; }
  if (playing.length !== 1) return;
  const from = decks[playing[0]], toId = other(from.id), to = decks[toId];
  const secs = parseInt($('#auto-secs').value, 10) || 8;
  const remaining = from.duration - from.position();
  if (!from.duration) return;
  const cut = from.kind === 'spotify' && queue[0] && queue[0].type === 'spotify';
  if (remaining > (cut ? 0.8 : secs + 1)) return;
  if (!queue.length) { mix.on = false; $('#btn-auto').classList.remove('on'); toast('Queue empty — auto-mix off'); return; }
  mix.busy = true;
  try {
    const next = queue.shift(); renderQueue();
    const ok = await loadToDeck(toId, next, true);
    if (ok) {
      const target = toId === 'B' ? 1 : 0;
      if (cut) setCrossfader(target); else await fadeTo(target, Math.max(2, Math.min(secs, remaining)));
      if (!cut) { from.pause(); from.offset = 0; }
    }
  } finally { mix.busy = false; }
}
setInterval(autoMixTick, 300);

/* ================= Library ================= */
function trackRow(t, opts = {}) {
  const r = document.createElement('div'); r.className = 'row' + (opts.q ? ' q' : '');
  const meta = `${t.bpm ? Math.round(t.bpm) + ' BPM' : (t.type === 'local' ? '…' : '')}<br>${t.dur ? fmtT(t.dur / 1000, false) : ''}`;
  r.innerHTML = `${opts.q ? `<span class="mt">${opts.i + 1}</span>` : ''}<div class="thumb">${t.art ? `<img src="${esc(t.art)}" alt="">` : '♪'}</div>
    <div class="ti"><b>${esc(t.title)}</b><span>${esc(t.artist || '')}</span></div><div class="mt">${meta}</div>
    <button data-a="A">→A</button><button data-a="B">→B</button>${opts.q ? '<button data-a="X">✕</button>' : '<button data-a="Q">+Q</button>'}`;
  r.addEventListener('click', e => {
    const a = e.target.dataset && e.target.dataset.a; if (!a) return;
    if (a === 'Q') { queue.push(t); renderQueue(); toast('Added to queue'); }
    else if (a === 'X') { queue.splice(opts.i, 1); renderQueue(); }
    else loadToDeck(a, t);
  });
  return r;
}
function renderList(el, tracks, empty = 'Nothing here yet.') {
  el.innerHTML = '';
  if (!tracks.length) { el.innerHTML = `<div class="empty">${esc(empty)}</div>`; return; }
  tracks.forEach(t => el.appendChild(trackRow(t)));
}
function renderQueue() {
  setText($('#qcount'), String(queue.length));
  const pane = $('#tab-queue');
  pane.innerHTML = `<div class="panel"><button class="gbtn" id="q-next">LOAD NEXT → IDLE DECK</button><button class="gbtn alt" id="q-clear">CLEAR</button><button class="gbtn alt" id="q-bpm">SORT LOCAL BY BPM</button><span style="color:#aaa;font-size:10px">Auto-mix takes tracks from the top, one by one.</span></div><div class="list" id="q-list"></div>`;
  const list = $('#q-list', pane);
  if (!queue.length) list.innerHTML = '<div class="empty">Queue is empty. Use “+Q” on any track, or generate a set in the Spotify tab.</div>';
  queue.forEach((t, i) => list.appendChild(trackRow(t, { q: true, i })));
  $('#q-clear').onclick = () => { queue.length = 0; renderQueue(); };
  $('#q-next').onclick = () => {
    if (!queue.length) return;
    const id = decks.A.playing && !decks.B.playing ? 'B' : (!decks.A.playing ? 'A' : 'B');
    loadToDeck(id, queue.shift()); renderQueue();
  };
  $('#q-bpm').onclick = () => {
    const loc = queue.filter(t => t.type === 'local').sort((a, b) => (a.bpm || 0) - (b.bpm || 0));
    const rest = queue.filter(t => t.type !== 'local');
    queue.splice(0, queue.length, ...loc, ...rest); renderQueue();
  };
}

/* ---- local files ---- */
function buildLocal() {
  const pane = $('#tab-local');
  pane.innerHTML = `<div class="drop" id="drop">Drop audio files here (mp3 / wav / m4a / flac) or <label class="gbtn" style="cursor:pointer;margin-left:8px">CHOOSE FILES<input type="file" id="file" accept="audio/*" multiple hidden></label>
    <div style="margin-top:6px;font-size:10px">Files stay in your browser — nothing is uploaded. BPM is detected automatically.</div></div>
    <div class="panel"><button class="gbtn alt" id="loc-q">ADD ALL TO QUEUE (BPM ORDER)</button></div><div class="list" id="loc-list"></div>`;
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, ev => { ev.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', ev => addFiles([...ev.dataTransfer.files]));
  $('#file').addEventListener('change', ev => addFiles([...ev.target.files]));
  $('#loc-q').onclick = () => {
    queue.push(...[...localTracks].sort((a, b) => (a.bpm || 0) - (b.bpm || 0)));
    renderQueue(); toast('Local tracks queued in BPM order');
  };
  renderLocal();
}
function renderLocal() {
  renderList($('#loc-list'), localTracks, 'No local tracks yet. Try “DEMO LOOPS” at the top to test mixing and FX straight away.');
}
async function addFiles(files) {
  const audio = files.filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|flac|ogg|aac)$/i.test(f.name));
  for (const file of audio) {
    const t = { type: 'local', file, title: file.name.replace(/\.[^.]+$/, ''), artist: 'Local file', bpm: 0, dur: 0 };
    localTracks.push(t); renderLocal();
    try {
      const buf = await Engine.ctx.decodeAudioData(await file.arrayBuffer());
      t.dur = buf.duration * 1000; const r = await detectBpm(buf); t.bpm = r.bpm; t.grid = r.grid;
    } catch (e) { toast('Could not decode ' + file.name); }
    renderLocal();
  }
}
function addDemos() {
  [[122, 0, 'Demo Loop 122'], [128, 1, 'Demo Loop 128'], [124, 0, 'Demo Loop 124']].forEach(([bpm, v, title]) => {
    const buffer = makeDemo(bpm, v);
    localTracks.push({ type: 'local', demo: true, buffer, title, artist: 'Built-in synth', bpm, grid: 0, dur: buffer.duration * 1000 });
  });
  renderLocal(); selectTab('local'); toast('3 demo loops added — load them to A / B');
}

/* ---- Spotify tab ---- */
function buildSpotify() {
  const pane = $('#tab-spotify');
  const warn = location.hostname === 'localhost' ? '<p style="color:var(--orange)">⚠ Open this page via <code>http://127.0.0.1:8765</code> (not “localhost”) — Spotify only accepts the loopback IP.</p>' : '';
  pane.innerHTML = `<div class="box" id="sp-login"><h4>CONNECT SPOTIFY</h4>${warn}
    <p>1. Create an app at <code>developer.spotify.com/dashboard</code> (tick Web API + Web Playback SDK).</p>
    <p>2. Add this Redirect URI exactly: <code>${esc(Spotify.redirect)}</code></p>
    <p>3. If the app is in Development mode, add your Spotify email under User Management.</p>
    <div class="panel"><input type="text" id="cid" placeholder="Paste Client ID (kept in this browser only)" value="${esc(Spotify.clientId)}"><button class="gbtn" id="sp-go">CONNECT</button></div>
    <p style="color:#9a9893">Playback of streamed tracks needs Spotify Premium. No client secret is used (PKCE login).</p></div>
    <div id="sp-main" hidden>
      <div class="box"><h4>PICK SONGS</h4><div class="panel">
        <select id="src"><option value="search">Search</option><option value="liked">Liked songs</option><option value="top">My top tracks</option><option value="playlist">Playlist</option></select>
        <input type="text" id="q" placeholder="Search tracks / artists / genre:house"><select id="pl" hidden></select>
        <button class="gbtn" id="sp-load">LOAD</button></div><div class="list" id="sp-list"></div></div>
      <div class="box"><h4>GENERATE SONG LIST → QUEUE</h4><div class="panel">
        <label>Source <select id="g-src"><option value="liked">Liked songs</option><option value="top">My top tracks</option><option value="playlist">Playlist (above)</option><option value="search">Search (above)</option></select></label>
        <label>Tracks <input type="range" id="g-n" min="8" max="40" value="20" style="min-width:110px"><b id="g-nv">20</b></label>
        <label>Order <select id="g-ord"><option value="ramp">Energy ramp ↗ (popularity proxy)</option><option value="arc">Energy arc ↗↘</option><option value="shuffle">Shuffle</option><option value="newest">Newest first</option><option value="spread">Artist spread</option></select></label>
        <button class="gbtn" id="g-go">GENERATE</button></div>
        <p style="color:#9a9893">Spotify retired its BPM / energy / recommendations APIs for new apps, so ordering uses popularity, year and artist spacing — not true BPM or key. Use Local files if you need real BPM matching.</p></div>
    </div>`;
  $('#sp-go').onclick = async () => {
    try { Spotify.clientId = $('#cid').value; await Spotify.login(); } catch (e) { toast(e.message); }
  };
  $('#g-n').oninput = e => setText($('#g-nv'), e.target.value);
  $('#src').onchange = () => { $('#q').hidden = $('#src').value !== 'search'; $('#pl').hidden = $('#src').value !== 'playlist'; };
  $('#sp-load').onclick = async () => {
    const btn = $('#sp-load'); btn.disabled = true;
    try { renderList($('#sp-list'), await fetchPool($('#src').value, 30), 'No tracks returned.'); }
    catch (e) { toast('Spotify: ' + e.message); } finally { btn.disabled = false; }
  };
  $('#g-go').onclick = generateSet;
}
async function fetchPool(src, max) {
  if (src === 'search') { const q = $('#q').value.trim(); if (!q) throw new Error('Type something to search'); return Spotify.search(q, max); }
  if (src === 'liked') return Spotify.liked(200);
  if (src === 'top') return Spotify.top();
  const id = $('#pl').value; if (!id) throw new Error('Pick a playlist');
  return Spotify.playlistTracks(id, 200);
}
async function generateSet() {
  const btn = $('#g-go'); btn.disabled = true;
  try {
    const n = +$('#g-n').value, ord = $('#g-ord').value;
    let pool = await fetchPool($('#g-src').value, 40);
    const seen = new Set(); pool = pool.filter(t => !seen.has(t.id) && seen.add(t.id));
    if (!pool.length) throw new Error('Source returned no tracks');
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let set = pool.slice(0, n);
    const pop = t => (typeof t.pop === 'number' ? t.pop : 50);
    if (ord === 'ramp') set.sort((a, b) => pop(a) - pop(b));
    else if (ord === 'arc') { set.sort((a, b) => pop(a) - pop(b)); const up = [], down = []; set.forEach((t, i) => (i % 2 ? down : up).push(t)); set = [...up, ...down.reverse()]; }
    else if (ord === 'newest') set.sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (ord === 'spread') {
      const out = []; const rest = [...set];
      while (rest.length) { const i = rest.findIndex(t => !out.length || t.artist !== out[out.length - 1].artist); out.push(...rest.splice(i < 0 ? 0 : i, 1)); }
      set = out;
    }
    queue.length = 0; queue.push(...set); renderQueue(); selectTab('queue');
    toast(`Generated ${set.length}-track set (${ord}) — press ENTER to auto-mix`);
  } catch (e) { toast('Generate: ' + e.message); } finally { btn.disabled = false; }
}
async function initSpotifyUI() {
  try {
    const ok = await Spotify.start();
    if (!ok) return;
    $('#sp-login').hidden = true; $('#sp-main').hidden = false;
    const me = Spotify.me || {};
    const prem = me.product === 'premium';
    setStatus(`Spotify: <b>${esc(me.display_name || me.id || 'connected')}</b> (${esc(me.product || '?')})${prem ? '' : ' — free accounts can browse but not stream here'}`);
    Spotify.onStatus = (s, msg) => {
      if (s === 'ready') toast('Spotify player ready');
      else if (s !== 'offline') toast(`Spotify ${s}: ${msg}`);
    };
    const pls = await Spotify.playlists();
    $('#pl').innerHTML = pls.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    const bar = $('#tab-spotify .box h4');
    const out = document.createElement('button'); out.className = 'gbtn alt'; out.textContent = 'DISCONNECT'; out.style.float = 'right';
    out.onclick = () => Spotify.logout(); bar.appendChild(out);
  } catch (e) {
    console.error(e); toast('Spotify: ' + e.message);
    $('#sp-login').hidden = false; $('#sp-main').hidden = true;
  }
}

function selectTab(name) {
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  ['spotify', 'local', 'queue'].forEach(n => { $('#tab-' + n).hidden = n !== name; });
}

/* ================= Hotkeys ================= */
const held = new Set();
const deckKeys = {
  A: { KeyQ: 'play', KeyW: 'cue', KeyE: 'sync', KeyR: 'loop', KeyZ: 'brake' },
  B: { KeyU: 'play', KeyI: 'cue', KeyO: 'sync', KeyP: 'loop', KeyX: 'brake' },
};
const fxKeys = { KeyA: 'echo', KeyS: 'reverb', KeyD: 'flanger', KeyF: 'crush', KeyG: 'gate' };

addEventListener('keydown', e => {
  Engine.resume();
  if (e.target.closest && e.target.closest('input[type=text],input[type=search],select,textarea')) return;
  if (e.metaKey || e.ctrlKey) return;
  const c = e.code;
  if (e.key === '?' || (c === 'Slash' && e.shiftKey)) { $('#help').hidden = !$('#help').hidden; return; }
  if (c === 'Escape') { $('#help').hidden = true; return; }
  if (c === 'ArrowLeft' || c === 'ArrowRight') { e.preventDefault(); setCrossfader(Engine.xf + (c === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.02)); return; }
  if (c === 'ArrowUp' || c === 'ArrowDown') {
    if (!selKnob) return; e.preventDefault();
    selKnob.nudge(c === 'ArrowUp' ? 1 : -1, e.shiftKey ? 5 : e.altKey ? 0.2 : 1);
    setStatus(`▶ <b>${esc(selKnob.name)}</b> — ${esc(selKnob.fmt(selKnob.value))}`); return;
  }
  if (c === 'Comma') return setCrossfader(0);
  if (c === 'Period') return setCrossfader(1);
  if (c === 'Backslash') return setCrossfader(0.5);
  if (c === 'Enter') { e.preventDefault(); if (!e.repeat) toggleAuto(); return; }
  if (e.repeat) { if (knobByCode[c] || fxKeys[c] || deckKeys.A[c] || deckKeys.B[c]) e.preventDefault(); return; }
  if (knobByCode[c]) { e.preventDefault(); knobByCode[c].select(); return; }
  if (fxKeys[c]) { e.preventDefault(); Engine.setFx(fxKeys[c], true); return; }
  for (const id of ['A', 'B']) {
    const a = deckKeys[id][c]; if (!a) continue;
    e.preventDefault(); const b = ui[id].btn[a];
    if (a === 'cue') { b.classList.add('held'); decks[id].cuePress(); } else if (!b.disabled) b.click();
    return;
  }
});
addEventListener('keyup', e => {
  const c = e.code;
  if (fxKeys[c]) Engine.setFx(fxKeys[c], false);
  for (const id of ['A', 'B']) if (deckKeys[id][c] === 'cue') { ui[id].btn.cue.classList.remove('held'); decks[id].cueRelease(); }
});
addEventListener('blur', () => Object.keys(Engine.fx).forEach(n => Engine.setFx(n, false)));
addEventListener('pointerdown', () => { Engine.resume(); Spotify.player && Spotify.player.activateElement && Spotify.player.activateElement(); }, true);

/* ================= Render loop ================= */
const meterCtx = $('#meters').getContext('2d');
const rms = an => {
  const a = new Float32Array(an.fftSize); an.getFloatTimeDomainData(a);
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
};
const dbFrac = r => clamp((20 * Math.log10(r + 1e-6) + 48) / 48, 0, 1);
const meterLevels = { A: 0, B: 0, M: 0 };

function drawMeters() {
  const g = meterCtx, W = 240, H = 96;
  g.clearRect(0, 0, W, H);
  const cols = [['A', 'A', '#f3b52e'], ['M', 'MST', '#fff'], ['B', 'B', '#ee5b2b']];
  cols.forEach(([k, label, col], ci) => {
    const x0 = 20 + ci * 76, segs = 14, lit = Math.round(meterLevels[k] * segs);
    for (let s = 0; s < segs; s++) {
      g.fillStyle = s < lit ? (s > segs - 3 ? '#d83b2a' : col) : '#26292e';
      g.fillRect(x0, H - 16 - (s + 1) * 5.4, 44, 4);
    }
    g.fillStyle = '#8a8d92'; g.font = '10px Space Mono, monospace'; g.textAlign = 'center';
    g.fillText(label, x0 + 22, H - 3);
  });
}

function drawWave(D, u, pos, dur) {
  const cv = u.f.wave, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (D.kind === 'local' && D.wDim) {
    g.drawImage(D.wDim, 0, 0);
    const px = Math.floor(pos / dur * W);
    if (px > 0) g.drawImage(D.wBright, 0, 0, px, H, 0, 0, px, H);
    if (D.loop) { g.fillStyle = 'rgba(238,91,43,.35)'; g.fillRect(D.loop.start / dur * W, 0, (D.loop.end - D.loop.start) / dur * W, H); }
    const cx = D.cuePoint / dur * W; g.fillStyle = '#f3b52e'; g.fillRect(cx, 0, 2, H);
    g.fillStyle = '#ff2a2a'; g.fillRect(px - 1, 0, 3, H);
  } else if (D.kind === 'spotify') {
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, H / 2 - 5, W, 10);
    const px = dur ? pos / dur * W : 0;
    g.fillStyle = '#fff'; g.fillRect(0, H / 2 - 5, px, 10);
    g.fillStyle = '#ff2a2a'; g.fillRect(px - 1, 0, 3, H);
    g.fillStyle = '#8a8d92'; g.font = '16px Space Mono, monospace'; g.textAlign = 'center';
    g.fillText('SPOTIFY STREAM · no waveform / EQ / FX', W / 2, H - 14);
  } else {
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, H / 2, W, 1);
  }
}

function drawScope(D, u, pos) {
  const cv = u.f.scope, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  if (D.kind !== 'local' || !D.fine) { g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(0, H / 2, W, 1); return; }
  const span = 6, pps = W / span, FR = 100;
  g.fillStyle = 'rgba(255,255,255,.75)';
  for (let x = 0; x < W; x++) {
    const i = Math.floor((pos + (x - W / 2) / pps) * FR);
    if (i < 0 || i >= D.fine.length) continue;
    const h = Math.max(1, D.fine[i] * H * 0.9); g.fillRect(x, (H - h) / 2, 1, h);
  }
  const bl = D.beatLen;
  if (bl) {
    const k0 = Math.ceil((pos - span / 2 - D.grid) / bl);
    for (let k = k0, t; (t = D.grid + k * bl) <= pos + span / 2; k++) {
      const x = W / 2 + (t - pos) * pps, down = ((k % 4) + 4) % 4 === 0;
      g.fillStyle = down ? '#f3b52e' : 'rgba(243,181,46,.6)'; g.fillRect(x - 1, down ? 0 : H * 0.55, 2, down ? H : H * 0.45);
    }
  }
  g.fillStyle = '#ff2a2a'; g.fillRect(W / 2 - 1, 0, 3, H);
}

let lastT = performance.now(), frame = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; frame++;
  for (const id of ['A', 'B']) {
    const D = decks[id], u = ui[id];
    if (D.kind === 'spotify' && Spotify.last && Spotify.last.uri === D.track.uri) D.playing = !Spotify.last.paused;
    const pos = D.position(), dur = D.duration;
    if (D.playing) u.angle = (u.angle + dt * 200 * (D.kind === 'local' ? D.rate : 1)) % 360;
    u.f.vinyl.style.transform = `rotate(${u.angle}deg)`;
    drawWave(D, u, pos, dur); drawScope(D, u, pos);
    if (frame % 3 === 0) {
      setText(u.f.elapsed, fmtT(pos)); setText(u.f.remain, '-' + fmtT(dur - pos));
      setText(u.f.bpm, D.curBpm ? D.curBpm.toFixed(1) : '---');
      setText(u.f.tempo, D.kind === 'local' ? tempoFmt(D.rate - 1) : '');
      u.btn.play.classList.toggle('on', D.playing);
      u.btn.loop.classList.toggle('on', !!D.loop);
      u.btn.sync.classList.toggle('on', D.syncOn);
      setText(u.f.gv, D.kind === 'local' && D.bpm ? `beat1 @ ${(D.grid * 1000).toFixed(0)} ms · ${D.bpm.toFixed(2)} BPM` : '');
    }
    const lvl = D.kind === 'local' ? dbFrac(rms(D.analyser)) : 0;
    meterLevels[id] = Math.max(lvl, meterLevels[id] - dt * 1.5);
  }
  meterLevels.M = Math.max(dbFrac(rms(Engine.meter)), meterLevels.M - dt * 1.5);
  if (frame % 2 === 0) drawMeters();
  if (frame % 30 === 0) {
    const lead = ['A', 'B'].map(i => decks[i]).filter(d => d.playing && d.curBpm).sort((a, b) => b.xfGain * b.volKnob - a.xfGain * a.volKnob)[0];
    if (lead) Engine.setTempoRef(lead.curBpm);
  }
  requestAnimationFrame(loop);
}

/* ================= Boot ================= */
buildDeck('A'); buildDeck('B'); buildMixer(); buildLocal(); buildSpotify(); renderQueue();
refreshDeckStatic('A'); refreshDeckStatic('B'); updateXfLabel();
$$('.tabs button').forEach(b => b.addEventListener('click', () => selectTab(b.dataset.tab)));
$('#btn-demo').onclick = addDemos;
$('#btn-keys').onclick = () => { $('#help').hidden = false; };
$('#help-x').onclick = () => { $('#help').hidden = true; };
$('#help').addEventListener('click', e => { if (e.target.id === 'help') $('#help').hidden = true; });
requestAnimationFrame(loop);
initSpotifyUI();
