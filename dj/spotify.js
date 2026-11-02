'use strict';
/* Spotify: PKCE login (no client secret), Web API browsing, Web Playback SDK for one streaming deck.
   Note: Spotify gives no raw audio, so streamed tracks can only be faded (volume), not EQ'd or effected. */

const Spotify = {
  token: null, exp: 0, refresh: null, player: null, deviceId: null, last: null,
  me: null, ready: false, _vol: 1, _vt: null,
  scopes: 'streaming user-read-email user-read-private user-library-read playlist-read-private playlist-read-collaborative user-top-read user-read-playback-state user-modify-playback-state',

  get clientId() { return localStorage.getItem('sp_client_id') || ''; },
  set clientId(v) { localStorage.setItem('sp_client_id', v.trim()); },
  get redirect() { return location.origin + location.pathname; },
  get connected() { return !!this.token || !!this.refresh; },

  async sha(s) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  async login() {
    if (!this.clientId) throw new Error('Enter your Spotify Client ID first');
    const arr = crypto.getRandomValues(new Uint8Array(48));
    const verifier = btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem('sp_verifier', verifier);
    const q = new URLSearchParams({
      client_id: this.clientId, response_type: 'code', redirect_uri: this.redirect,
      scope: this.scopes, code_challenge_method: 'S256', code_challenge: await this.sha(verifier),
    });
    location.href = 'https://accounts.spotify.com/authorize?' + q;
  },

  logout() {
    ['sp_tok', 'sp_verifier'].forEach(k => localStorage.removeItem(k));
    this.token = this.refresh = null; this.me = null;
    this.player && this.player.disconnect();
    location.reload();
  },

  setTokens(j) {
    this.token = j.access_token; this.exp = Date.now() + j.expires_in * 1000;
    if (j.refresh_token) this.refresh = j.refresh_token;
    localStorage.setItem('sp_tok', JSON.stringify({ token: this.token, exp: this.exp, refresh: this.refresh }));
  },

  async tokenReq(params) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...params }),
    });
    if (!r.ok) throw new Error('Token error ' + r.status + ' ' + await r.text());
    this.setTokens(await r.json());
  },

  async start() {
    const code = new URLSearchParams(location.search).get('code');
    const err = new URLSearchParams(location.search).get('error');
    if (err) { history.replaceState({}, '', location.pathname); throw new Error('Spotify login: ' + err); }
    if (code) {
      await this.tokenReq({ grant_type: 'authorization_code', code, redirect_uri: this.redirect, code_verifier: localStorage.getItem('sp_verifier') || '' });
      history.replaceState({}, '', location.pathname);
    } else {
      try {
        const t = JSON.parse(localStorage.getItem('sp_tok') || 'null');
        if (t) { this.token = t.token; this.exp = t.exp; this.refresh = t.refresh; }
      } catch (e) { /* ignore corrupt storage */ }
    }
    if (!this.connected) return false;
    this.me = await this.api('/me');
    this.initPlayer();
    return true;
  },

  async ensureToken() {
    if (this.token && Date.now() < this.exp - 60000) return this.token;
    if (!this.refresh) throw new Error('Not connected to Spotify');
    await this.tokenReq({ grant_type: 'refresh_token', refresh_token: this.refresh });
    return this.token;
  },

  async api(path, opts = {}, retry = true) {
    const tok = await this.ensureToken();
    const url = path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path;
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    if (r.status === 429 && retry) {
      await new Promise(res => setTimeout(res, (+r.headers.get('Retry-After') || 1) * 1000));
      return this.api(path, opts, false);
    }
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 160));
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },

  norm(t) {
    if (!t || t.type === 'episode' || !t.uri) return null;
    const imgs = (t.album && t.album.images) || [];
    return {
      type: 'spotify', id: t.id, uri: t.uri, title: t.name,
      artist: (t.artists || []).map(a => a.name).join(', '), album: t.album && t.album.name,
      art: imgs.length ? imgs[imgs.length - 1].url : '', artBig: imgs.length ? imgs[0].url : '',
      dur: t.duration_ms, pop: t.popularity, year: parseInt((t.album && t.album.release_date) || '0', 10) || 0,
    };
  },

  async pager(path, max, pick) {
    const out = []; let next = path + (path.includes('?') ? '&' : '?') + 'limit=50';
    while (next && out.length < max) {
      const j = await this.api(next);
      for (const it of (j.items || [])) { const t = this.norm(pick(it)); if (t) out.push(t); }
      next = j.next;
    }
    return out.slice(0, max);
  },

  playlists() { return this.api('/me/playlists?limit=50').then(j => (j.items || []).filter(Boolean)); },
  liked(max = 200) { return this.pager('/me/tracks', max, it => it.track); },
  top(range = 'medium_term') { return this.pager('/me/top/tracks?time_range=' + range, 50, it => it); },
  async playlistTracks(id, max = 200) {
    const pick = it => it.item || it.track;
    try { return await this.pager(`/playlists/${id}/items`, max, pick); }
    catch (e) { return this.pager(`/playlists/${id}/tracks`, max, pick); }
  },
  async search(q, total = 30) {
    const out = [];
    for (let off = 0; off < total; off += 10) {
      const j = await this.api(`/search?type=track&limit=10&offset=${off}&q=${encodeURIComponent(q)}`);
      const items = (j.tracks && j.tracks.items) || [];
      for (const it of items) { const t = this.norm(it); if (t) out.push(t); }
      if (items.length < 10) break;
    }
    return out;
  },

  /* ---- Web Playback SDK ---- */
  initPlayer() {
    if (this.player || document.getElementById('sp-sdk')) return;
    window.onSpotifyWebPlaybackSDKReady = () => {
      this.player = new window.Spotify.Player({
        name: 'DJ-24 Mixer', volume: 0.8,
        getOAuthToken: cb => this.ensureToken().then(cb),
      });
      this.player.addListener('ready', ({ device_id }) => { this.deviceId = device_id; this.ready = true; this.onStatus && this.onStatus('ready'); });
      this.player.addListener('not_ready', () => { this.ready = false; this.onStatus && this.onStatus('offline'); });
      for (const k of ['account_error', 'authentication_error', 'initialization_error', 'playback_error'])
        this.player.addListener(k, e => this.onStatus && this.onStatus(k, e.message));
      this.player.connect();
      setInterval(() => this.poll(), 500);
    };
    const s = document.createElement('script');
    s.id = 'sp-sdk'; s.src = 'https://sdk.scdn.co/spotify-player.js'; document.head.appendChild(s);
  },

  async poll() {
    if (!this.player) return;
    const s = await this.player.getCurrentState();
    if (s) this.last = { pos: s.position, paused: s.paused, ts: performance.now(), dur: s.duration, uri: s.track_window && s.track_window.current_track && s.track_window.current_track.uri };
  },

  position() {
    const l = this.last; if (!l) return 0;
    return (l.pos + (l.paused ? 0 : performance.now() - l.ts)) / 1000;
  },

  async playUri(uri, posMs = 0) {
    if (!this.deviceId) throw new Error('player not ready (needs Premium + a browser with DRM support)');
    this.player.activateElement && this.player.activateElement();
    await this.api(`/me/player/play?device_id=${this.deviceId}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: posMs }) });
    this.last = { pos: posMs, paused: false, ts: performance.now(), uri };
  },
  async resume() {
    if (this.last) this.last = { ...this.last, pos: this.position() * 1000, paused: false, ts: performance.now() };
    await this.player.resume();
  },
  pause() {
    if (this.last) this.last = { ...this.last, pos: this.position() * 1000, paused: true, ts: performance.now() };
    this.player && this.player.pause();
  },
  seek(ms) {
    if (this.last) this.last = { ...this.last, pos: ms, ts: performance.now() };
    this.player && this.player.seek(ms);
  },
  setVolume(v) {
    this._vol = v;
    if (this._vt) return;
    this._vt = setTimeout(() => { this._vt = null; this.player && this.player.setVolume(this._vol); }, 80);
  },
};
