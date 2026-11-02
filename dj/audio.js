'use strict';
/* DJ-24 audio engine: two decks → EQ → filter → crossfader → master bus → FX sends → limiter */

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

const Engine = {
  ctx: null, decks: {}, fx: {}, fxAmount: 0.5, masterVol: 0.8, xf: 0.5, fxListener: null,

  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.bus = ctx.createGain();
    this.dry = ctx.createGain();
    this.fxOut = ctx.createGain();
    this.master = ctx.createGain();
    this.master.gain.value = this.masterVol;
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3; this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.12;
    this.bus.connect(this.dry); this.dry.connect(this.master);
    this.fxOut.connect(this.master);
    this.master.connect(this.limiter); this.limiter.connect(ctx.destination);
    this.meter = ctx.createAnalyser(); this.meter.fftSize = 512;
    this.limiter.connect(this.meter);
    this.buildFx();
    this.decks.A = new Deck('A');
    this.decks.B = new Deck('B');
    this.setXf(this.xf);
  },

  resume() { if (this.ctx.state !== 'running') this.ctx.resume(); },

  makeIR(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  },

  buildFx() {
    const ctx = this.ctx, fx = this.fx;
    const mk = (name, nodeIn, nodeOut, duck = 0) => {
      const send = ctx.createGain(); send.gain.value = 0;
      this.bus.connect(send); send.connect(nodeIn); nodeOut.connect(this.fxOut);
      fx[name] = { send, on: false, duck };
    };
    // ECHO: tempo-synced dotted-8th delay with darkening feedback
    const dl = ctx.createDelay(2); dl.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    dl.connect(lp); lp.connect(fb); fb.connect(dl);
    this.echoDelay = dl;
    mk('echo', dl, lp);
    // REVERB: generated noise impulse response
    const conv = ctx.createConvolver(); conv.buffer = this.makeIR(2.6, 2.6);
    const rg = ctx.createGain(); rg.gain.value = 1.5; conv.connect(rg);
    mk('reverb', conv, rg);
    // FLANGER: short delay swept by LFO, with feedback
    const fd = ctx.createDelay(0.05); fd.delayTime.value = 0.004;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.27;
    const depth = ctx.createGain(); depth.gain.value = 0.0028;
    lfo.connect(depth); depth.connect(fd.delayTime); lfo.start();
    const ffb = ctx.createGain(); ffb.gain.value = 0.68; fd.connect(ffb); ffb.connect(fd);
    mk('flanger', fd, fd);
    // CRUSH: coarse quantiser (ducks the dry signal)
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.round(x * 6) / 6; }
    shaper.curve = curve;
    const pre = ctx.createGain(); pre.gain.value = 1.4;
    const post = ctx.createBiquadFilter(); post.type = 'lowpass'; post.frequency.value = 7000;
    pre.connect(shaper); shaper.connect(post);
    mk('crush', pre, post, 0.85);
    // GATE: 8th-note square LFO chops the signal (ducks the dry signal fully)
    const gg = ctx.createGain(); gg.gain.value = 0.5;
    const gl = ctx.createOscillator(); gl.type = 'square'; gl.frequency.value = 4;
    const gd = ctx.createGain(); gd.gain.value = 0.5;
    gl.connect(gd); gd.connect(gg.gain); gl.start();
    this.gateLfo = gl;
    mk('gate', gg, gg, 1);
  },

  setTempoRef(bpm) {
    if (!bpm || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.echoDelay.delayTime.setTargetAtTime(Math.min(1.9, 60 / bpm * 0.75), t, 0.05);
    this.gateLfo.frequency.setTargetAtTime(bpm / 60 * 2, t, 0.05);
  },

  setFx(name, on) {
    const f = this.fx[name];
    if (!f || f.on === on) return;
    f.on = on;
    this.refreshFx();
    this.fxListener && this.fxListener(name, on);
  },

  setFxAmount(v) { this.fxAmount = v; this.refreshFx(); },

  refreshFx() {
    const t = this.ctx.currentTime;
    let duck = 0;
    for (const f of Object.values(this.fx)) {
      f.send.gain.setTargetAtTime(f.on ? this.fxAmount : 0, t, 0.015);
      if (f.on) duck = Math.max(duck, f.duck * this.fxAmount);
    }
    this.dry.gain.setTargetAtTime(1 - duck, t, 0.015);
  },

  setMaster(v) {
    this.masterVol = v;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
    for (const d of Object.values(this.decks)) d.refreshSpotifyVol();
  },

  setXf(x) {
    this.xf = clampN(x, 0, 1);
    this.decks.A.setXf(Math.cos(this.xf * Math.PI / 2));
    this.decks.B.setXf(Math.sin(this.xf * Math.PI / 2));
  },
};

class Deck {
  constructor(id) {
    const ctx = Engine.ctx;
    this.id = id; this.kind = null; this.track = null; this.buffer = null; this.src = null;
    this.playing = false; this.offset = 0; this.anchor = 0; this.rate = 1; this.tempo = 1;
    this.cuePoint = 0; this.loop = null; this.bpm = 0; this.grid = 0; this.syncOn = false; this.volKnob = 1; this.xfGain = 0.707;
    this.braking = false; this.previewing = false; this.spStarted = false; this.peaks = null;

    this.in = ctx.createGain();
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 250;
    this.mid = ctx.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1000; this.mid.Q.value = 0.8;
    this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 3500;
    this.filt = ctx.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 20000;
    this.vol = ctx.createGain(); this.xf = ctx.createGain();
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
    this.in.connect(this.low); this.low.connect(this.mid); this.mid.connect(this.high);
    this.high.connect(this.filt); this.filt.connect(this.vol); this.vol.connect(this.xf);
    this.xf.connect(this.analyser); this.xf.connect(Engine.bus);
  }

  get duration() {
    if (this.kind === 'spotify') return (this.track.dur || 0) / 1000;
    return this.buffer ? this.buffer.duration : 0;
  }
  get curBpm() { return this.bpm ? this.bpm * this.rate : 0; }
  get beatLen() { return this.bpm ? 60 / this.bpm : 0; }   // seconds of track time per beat
  beatPhase(pos = this.position()) {                       // 0..1 position inside the current beat
    const bl = this.beatLen; if (!bl) return 0;
    const p = ((pos - this.grid) / bl) % 1; return p < 0 ? p + 1 : p;
  }
  setBpm(b) { this.bpm = b; if (this.track) this.track.bpm = b; }
  setGrid(g) { this.grid = g; if (this.track) this.track.grid = g; }

  position() {
    if (this.kind === 'spotify') return Spotify.position();
    if (!this.playing) return this.offset;
    let t = this.offset + (Engine.ctx.currentTime - this.anchor) * this.rate;
    if (this.loop && t >= this.loop.end) {
      const len = this.loop.end - this.loop.start;
      t = this.loop.start + ((t - this.loop.start) % len);
    }
    return Math.min(t, this.duration);
  }
  reanchor() { this.offset = this.position(); this.anchor = Engine.ctx.currentTime; }

  loadBuffer(buffer, track) {
    this.unload();
    this.kind = 'local'; this.track = track; this.buffer = buffer;
    this.bpm = track.bpm || 0; this.grid = track.grid || 0; this.syncOn = false;
    this.offset = 0; this.cuePoint = 0; this.loop = null;
    this.computeWave();
  }
  loadSpotify(track) {
    this.unload();
    this.kind = 'spotify'; this.track = track; this.spStarted = false; this.bpm = 0;
    this.offset = 0; this.cuePoint = 0;
  }
  unload() {
    if (this.kind === 'spotify' && this.playing) Spotify.pause();
    this.killSrc();
    this.kind = null; this.track = null; this.buffer = null; this.peaks = null; this.fine = null; this.syncOn = false;
    this.playing = false; this.loop = null; this.offset = 0; this.bpm = 0;
    this.wDim = this.wBright = null;
  }
  killSrc() {
    if (!this.src) return;
    const s = this.src; this.src = null; s.onended = null;
    try { s.stop(); } catch (e) { /* already stopped */ }
    try { s.disconnect(); } catch (e) { /* ignore */ }
  }

  play() {
    if (!this.kind || this.playing || this.braking) return;
    Engine.resume();
    if (this.kind === 'spotify') { this.playing = true; this.spPlay(); return; }
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    const s = Engine.ctx.createBufferSource();
    s.buffer = this.buffer; s.playbackRate.value = this.rate;
    if (this.loop) { s.loopStart = this.loop.start; s.loopEnd = this.loop.end; s.loop = true; }
    s.connect(this.in);
    s.onended = () => {
      if (this.src === s) { this.src = null; this.playing = false; this.offset = 0; this.loop = null; }
    };
    s.start(0, this.offset);
    this.src = s; this.anchor = Engine.ctx.currentTime; this.playing = true;
  }
  async spPlay() {
    try {
      if (!this.spStarted) {
        this.spStarted = true;
        await Spotify.playUri(this.track.uri, Math.round((this.spStartSec || 0) * 1000));
        this.spStartSec = 0;
        this.refreshSpotifyVol();
      } else {
        await Spotify.resume();
      }
    } catch (e) {
      this.playing = false; this.spStarted = false;
      window.toast && window.toast('Spotify: ' + e.message);
    }
  }
  pause() {
    if (!this.playing) return;
    if (this.kind === 'spotify') { Spotify.pause(); this.playing = false; return; }
    this.offset = this.position(); this.killSrc(); this.playing = false;
  }
  toggle() { this.playing ? this.pause() : this.play(); }

  seek(t) {
    if (!this.kind) return;
    t = clampN(t, 0, Math.max(0, this.duration - 0.05));
    if (this.kind === 'spotify') {
      if (!this.spStarted) { this.spStartSec = t; return; }
      Spotify.seek(t * 1000); return;
    }
    const was = this.playing;
    if (was) { this.killSrc(); this.playing = false; }
    if (this.loop && (t < this.loop.start || t >= this.loop.end)) this.loop = null;
    this.offset = t;
    if (was) this.play();
  }

  cuePress() {
    if (!this.kind) return;
    if (this.kind === 'spotify') { this.pause(); this.seek(0); return; }
    if (this.playing) { this.pause(); this.seek(this.cuePoint); return; }
    if (Math.abs(this.offset - this.cuePoint) > 0.05) this.cuePoint = this.offset;
    else { this.previewing = true; this.play(); }
  }
  cueRelease() {
    if (!this.previewing) return;
    this.previewing = false; this.pause(); this.seek(this.cuePoint);
  }

  toggleLoop(beats = 4) {
    if (this.kind !== 'local') return false;
    this.reanchor();
    if (this.loop) {
      this.loop = null;
      if (this.src) this.src.loop = false;
      return false;
    }
    let start = this.offset;
    if (this.bpm && this.grid != null) start = clampN(this.grid + Math.round((start - this.grid) / this.beatLen) * this.beatLen, 0, this.duration);
    const len = this.bpm ? beats * 60 / this.bpm : 2;
    const end = Math.min(start + len, this.duration);
    this.loop = { start, end };
    if (this.src) { this.src.loopStart = start; this.src.loopEnd = end; this.src.loop = true; }
    return true;
  }

  applyRate(r) {
    if (this.kind === 'local') {
      if (this.playing) this.reanchor();
      this.rate = r;
      if (this.src) this.src.playbackRate.setValueAtTime(r, Engine.ctx.currentTime);
    }
  }
  setTempo(r) { this.tempo = r; if (!this.braking) this.applyRate(r); }

  brake() {
    if (this.kind !== 'local' || !this.playing || this.braking) return;
    this.braking = true;
    const t0 = performance.now(), r0 = this.rate, dur = 1100;
    const iv = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      this.applyRate(Math.max(0.03, r0 * Math.pow(1 - k, 1.6)));
      if (k >= 1) { clearInterval(iv); this.pause(); this.braking = false; this.applyRate(this.tempo); }
    }, 30);
  }

  setGain(v) { this.volKnob = v; this.vol.gain.setTargetAtTime(v, Engine.ctx.currentTime, 0.01); this.refreshSpotifyVol(); }
  setEq(band, v) {
    const db = v <= -0.98 ? -60 : (v < 0 ? v * 26 : v * 6);
    this[band].gain.setTargetAtTime(db, Engine.ctx.currentTime, 0.01);
  }
  setFilter(v) {
    const t = Engine.ctx.currentTime, f = this.filt;
    if (Math.abs(v) < 0.02) { f.type = 'lowpass'; f.frequency.setTargetAtTime(20000, t, 0.01); f.Q.setTargetAtTime(0.7, t, 0.01); return; }
    f.Q.setTargetAtTime(0.7 + Math.abs(v) * 5, t, 0.01);
    if (v < 0) { f.type = 'lowpass'; f.frequency.setTargetAtTime(Math.max(70, 20000 * Math.pow(1 + v, 3)), t, 0.01); }
    else { f.type = 'highpass'; f.frequency.setTargetAtTime(20 * Math.pow(400, v), t, 0.01); }
  }
  setXf(g) { this.xfGain = g; this.xf.gain.setTargetAtTime(g, Engine.ctx.currentTime, 0.01); this.refreshSpotifyVol(); }
  refreshSpotifyVol() {
    if (this.kind === 'spotify') Spotify.setVolume(Math.min(1, this.volKnob * this.xfGain * 1.414 * Engine.masterVol / 0.8));
  }

  computeWave() {
    const W = 720, H = 110, ch = this.buffer.getChannelData(0), per = Math.floor(ch.length / W);
    const peaks = new Float32Array(W);
    for (let i = 0; i < W; i++) {
      let m = 0; const s = i * per;
      for (let j = 0; j < per; j += 8) { const a = Math.abs(ch[s + j]); if (a > m) m = a; }
      peaks[i] = m;
    }
    this.peaks = peaks;
    const FR = 100, fn = Math.ceil(this.buffer.duration * FR), fper = Math.floor(this.buffer.sampleRate / FR);
    const fine = new Float32Array(fn);
    for (let i = 0; i < fn; i++) {
      let m = 0; const st = i * fper;
      for (let j = 0; j < fper; j += 4) { const v = Math.abs(ch[st + j] || 0); if (v > m) m = v; }
      fine[i] = m;
    }
    this.fine = fine;
    const mkc = col => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.fillStyle = col;
      for (let i = 0; i < W; i++) { const h = Math.max(1, peaks[i] * H * 0.95); g.fillRect(i, (H - h) / 2, 1, h); }
      return c;
    };
    this.wDim = mkc('rgba(255,255,255,0.28)');
    this.wBright = mkc('#ffffff');
  }
}

/* ---------- BPM + beat-grid detection (low-passed onset envelope, autocorrelation, phase search) ---------- */
function detectBpm(buffer) {
  return new Promise(resolve => setTimeout(() => {
    const sr = buffer.sampleRate, ch = buffer.getChannelData(0);
    const hop = 256, n = Math.floor(Math.min(ch.length, sr * 480) / hop);
    if (n < 800) return resolve({ bpm: 0, grid: 0 });
    const env = new Float32Array(n), a = 1 - Math.exp(-2 * Math.PI * 150 / sr);
    let y = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < hop; j++) { y += a * (ch[i * hop + j] - y); s += y * y; }
      env[i] = Math.sqrt(s / hop);
    }
    const on = new Float32Array(n + 2);
    for (let i = 1; i < n; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
    const fps = sr / hop;
    const score = (bpm, lo, hi) => {
      const lag = fps * 60 / bpm; let sum = 0, cnt = 0;
      for (let i = lo; i + Math.ceil(lag) + 1 < hi; i++) {
        const k = i + lag, k0 = Math.floor(k), f = k - k0;
        sum += on[i] * (on[k0] * (1 - f) + on[k0 + 1] * f); cnt++;
      }
      return cnt ? sum / cnt : 0;
    };
    // coarse: middle 90 s
    const w = Math.min(n, Math.floor(90 * fps)), lo = Math.floor((n - w) / 2);
    let best = 0, bs = -1;
    for (let b = 70; b <= 180; b += 0.5) { const sc = score(b, lo, lo + w); if (sc > bs) { bs = sc; best = b; } }
    if (best > 170) best /= 2;
    if (best < 75) best *= 2;
    // fine: joint search of tempo AND phase on the whole analysed range (comb score).
    // Searching them together stops a tiny tempo error from dragging the grid off the first beat.
    const comb = (period, ph) => {
      let sc = 0;
      for (let t = ph; t < n - 2; t += period) { const k = Math.floor(t), f = t - k; sc += on[k] * (1 - f) + on[k + 1] * f; }
      return sc;
    };
    let bpm = best, bestPh = 0; bs = -1;
    for (let b = best - 0.8; b <= best + 0.8; b += 0.02) {
      const period = fps * 60 / b;
      for (let ph = 0; ph < period; ph += 0.5) { const sc = comb(period, ph); if (sc > bs) { bs = sc; bpm = b; bestPh = ph; } }
    }
    {
      const period = fps * 60 / bpm, p0 = bestPh;
      for (let ph = p0 - 1; ph <= p0 + 1; ph += 0.1) { const sc = comb(period, ph < 0 ? ph + period : ph); if (sc > bs) { bs = sc; bestPh = ph < 0 ? ph + period : ph; } }
    }
    bpm = Math.round(bpm * 100) / 100;
    resolve({ bpm, grid: bestPh * hop / sr });
  }, 20));
}

/* ---------- Built-in demo loops (so effects/sync can be tried without any files) ---------- */
function makeDemo(bpm, variant) {
  const ctx = Engine.ctx, sr = ctx.sampleRate, beat = 60 / bpm, bars = 24;
  const len = Math.floor(sr * beat * 4 * bars);
  const buf = ctx.createBuffer(2, len, sr), d = buf.getChannelData(0), d2 = buf.getChannelData(1);
  const roots = variant === 0 ? [55, 55, 65.41, 49] : [61.74, 61.74, 73.42, 55];
  const add = (t0, fn, dur) => {
    const s0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
    for (let i = 0; i < n && s0 + i < len; i++) { const v = fn(i / sr, i / n); d[s0 + i] += v; d2[s0 + i] += v; }
  };
  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat, bar = Math.floor(b / 4);
    add(t, (x, k) => Math.sin(2 * Math.PI * (45 + 110 * Math.pow(1 - k, 4)) * x) * Math.pow(1 - k, 1.5) * 0.9, 0.28);
    if (variant === 1 && b % 4 === 3) add(t + beat / 2, (x, k) => Math.sin(2 * Math.PI * (45 + 110 * Math.pow(1 - k, 4)) * x) * Math.pow(1 - k, 1.5) * 0.7, 0.2);
    add(t + beat / 2, (x, k) => (Math.random() * 2 - 1) * Math.pow(1 - k, 6) * 0.22, 0.07);
    if (b % 2 === 1) add(t, (x, k) => (Math.random() * 2 - 1) * Math.pow(1 - k, 3) * 0.35, 0.14);
    const root = roots[bar % 4];
    for (let q = 0; q < 2; q++) {
      add(t + q * beat / 2 + (q ? 0 : beat / 4), (x, k) => {
        const ph = (x * root * (q ? 2 : 1)) % 1;
        return (ph * 2 - 1) * 0.16 * Math.pow(1 - k, 0.8) * (1 - Math.exp(-x * 600));
      }, beat * 0.4);
    }
    if (bar >= 4 && b % 8 === 0) {
      const f = root * 4 * (variant ? 1.5 : 1.2);
      add(t, (x, k) => (Math.sin(2 * Math.PI * f * x) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * x)) * 0.07 * Math.pow(1 - k, 1.2), beat * 3.5);
    }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = 0.85 / (peak || 1);
  for (let i = 0; i < len; i++) { d[i] *= g; d2[i] *= g; }
  return buf;
}
