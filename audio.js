(() => {
  'use strict';

  const SETTINGS_KEY = 'void-runner-audio-v2';
  const DEFAULTS = { music: .55, sfx: .72, muted: false };

  class VoidAudioManager {
    constructor() {
      this.ctx = null; this.master = null; this.musicBus = null; this.sfxBus = null;
      this.compressor = null; this.settings = this.loadSettings(); this.buffers = new Map();
      this.manifest = {}; this.musicTheme = ''; this.musicSection = 1; this.musicTimer = null;
      this.musicStep = 0; this.musicToken = 0; this.musicNodes = new Set(); this.voices = 0;
      this.lastPlayed = new Map(); this.duckTimer = null;
    }

    loadSettings() {
      try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) }; }
      catch (_) { return { ...DEFAULTS }; }
    }

    saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch (_) { /* opcional */ } }

    async init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.musicBus = this.ctx.createGain(); this.sfxBus = this.ctx.createGain();
        this.compressor = this.ctx.createDynamicsCompressor(); this.compressor.threshold.value = -12;
        this.compressor.knee.value = 14; this.compressor.ratio.value = 8; this.compressor.attack.value = .004; this.compressor.release.value = .18;
        this.musicBus.connect(this.compressor); this.sfxBus.connect(this.compressor); this.compressor.connect(this.master); this.master.connect(this.ctx.destination);
        this.applyMix(true); this.loadManifest();
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return this;
    }

    async loadManifest() {
      try {
        const response = await fetch('assets/audio/audio-manifest.json'); if (!response.ok) return;
        const data = await response.json(); this.manifest = data.files || {};
        await Promise.all(Object.entries(this.manifest).map(async ([name, path]) => {
          try { const file = await fetch(path); if (!file.ok) return; const buffer = await this.ctx.decodeAudioData(await file.arrayBuffer()); this.buffers.set(name, buffer); }
          catch (_) { /* usa síntesis provisional */ }
        }));
      } catch (_) { /* usa síntesis provisional */ }
    }

    applyMix(immediate = false) {
      if (!this.ctx) return; const now = this.ctx.currentTime, time = immediate ? .001 : .08;
      const master = this.settings.muted ? 0 : .88;
      for (const [node, value] of [[this.master, master], [this.musicBus, this.settings.music], [this.sfxBus, this.settings.sfx]]) {
        node.gain.cancelScheduledValues(now); node.gain.setTargetAtTime(value, now, time);
      }
    }

    setMusicVolume(value) { this.settings.music = Math.max(0, Math.min(1, value)); this.saveSettings(); this.applyMix(); }
    setSfxVolume(value) { this.settings.sfx = Math.max(0, Math.min(1, value)); this.saveSettings(); this.applyMix(); }
    setMuted(value) { this.settings.muted = Boolean(value); this.saveSettings(); this.applyMix(); }
    toggleMute() { this.setMuted(!this.settings.muted); return this.settings.muted; }

    panFor(player) { return player === 0 ? -.22 : player === 1 ? .22 : 0; }

    connectVoice(node, bus, pan = 0) {
      if (this.ctx.createStereoPanner) { const panner = this.ctx.createStereoPanner(); panner.pan.value = pan; node.connect(panner); panner.connect(bus); }
      else node.connect(bus);
    }

    tone(frequency, duration = .08, type = 'sine', volume = .08, slide = 1, options = {}) {
      if (!this.ctx || this.voices >= 28) return; this.voices++;
      const now = this.ctx.currentTime, oscillator = this.ctx.createOscillator(), gain = this.ctx.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(Math.max(25, frequency), now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(25, frequency * slide), now + duration);
      gain.gain.setValueAtTime(Math.max(.001, volume), now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      oscillator.connect(gain); this.connectVoice(gain, options.music ? this.musicBus : this.sfxBus, options.pan || 0);
      if (options.music) this.musicNodes.add(oscillator);
      oscillator.onended = () => { this.voices--; this.musicNodes.delete(oscillator); };
      oscillator.start(now); oscillator.stop(now + duration);
    }

    noise(duration = .16, volume = .08, options = {}) {
      if (!this.ctx || this.voices >= 28) return; this.voices++;
      const length = Math.floor(this.ctx.sampleRate * duration), buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.6);
      const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain(); source.buffer = buffer;
      filter.type = options.filter || 'lowpass'; filter.frequency.value = options.frequency || 1200; gain.gain.value = volume;
      source.connect(filter); filter.connect(gain); this.connectVoice(gain, this.sfxBus, options.pan || 0); source.onended = () => this.voices--; source.start();
    }

    playBuffer(name, options = {}) {
      const buffer = this.buffers.get(name); if (!buffer || !this.ctx) return false;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(); source.buffer = buffer; gain.gain.value = options.volume || 1;
      source.connect(gain); this.connectVoice(gain, this.sfxBus, this.panFor(options.player)); source.start(); return true;
    }

    allowed(name, player, cooldown) {
      const now = performance.now(), key = `${name}:${player ?? 'all'}`, last = this.lastPlayed.get(key) || 0;
      if (now - last < cooldown) return false; this.lastPlayed.set(key, now); return true;
    }

    play(name, options = {}) {
      if (!this.ctx || this.settings.muted) return false;
      const cooldowns = { player_shoot: 52, player_shoot_double: 62, enemy_shoot: 75, enemy_hit: 42, enemy_destroy: 55, ui_move: 65 };
      if (!this.allowed(name, options.player, cooldowns[name] || 18)) return false;
      if (this.playBuffer(name, options)) return true;
      const pan = this.panFor(options.player), t = (f, d, type, v, slide) => this.tone(f, d, type, v, slide, { pan });
      switch (name) {
        case 'player_shoot': t(440, .045, 'square', .035, 1.8); break;
        case 'player_shoot_double': t(360, .055, 'square', .045, 2.15); t(720, .035, 'sine', .025, .8); break;
        case 'player_special': t(170, .22, 'square', .07, 2.5); t(510, .16, 'triangle', .04, 1.35); break;
        case 'player_ulti': this.duck(900, .22); t(92, .75, 'sine', .15, 7); this.noise(.34, .07, { pan }); break;
        case 'player_dash': t(180, .13, 'sawtooth', .075, 3.4); break;
        case 'player_perfect_dash': this.duck(520, .35); this.noise(.14, .1, { pan, frequency: 2200 }); [420, 720, 1080, 1440].forEach((note, i) => setTimeout(() => this.tone(note, .18, i < 2 ? 'square' : 'sine', .11 - i * .012, 1.24, { pan }), i * 38)); break;
        case 'player_damage': t(115, .14, 'sawtooth', .09, .42); this.noise(.09, .05, { pan }); break;
        case 'player_shield': t(260, .28, 'sine', .08, 2.5); t(920, .18, 'triangle', .04, .7); break;
        case 'player_heal': [330, 440, 660].forEach((note, i) => setTimeout(() => this.tone(note, .2, 'sine', .055, 1.15, { pan }), i * 55)); break;
        case 'player_revive': this.duck(420, .55); [220, 330, 495, 740].forEach((note, i) => setTimeout(() => this.tone(note, .3, 'triangle', .075, 1.15, { pan }), i * 70)); break;
        case 'player_death': t(210, .62, 'sawtooth', .12, .18); this.noise(.4, .12, { pan, frequency: 700 }); break;
        case 'pickup_upgrade': [520, 780, 1040].forEach((note, i) => setTimeout(() => this.tone(note, .2, 'sine', .065, 1.05, { pan }), i * 62)); break;
        case 'enemy_shoot': t(280, .07, 'square', .035, .62); break;
        case 'enemy_shoot_heavy': t(145, .14, 'sawtooth', .075, .7); this.noise(.06, .03, { pan }); break;
        case 'enemy_hit': t(105, .055, 'sawtooth', .045, .52); break;
        case 'enemy_destroy': t(76, .2, 'sawtooth', .09, .32); this.noise(.18, .09, { frequency: 900 }); break;
        case 'enemy_special_spawn': t(130, .35, 'triangle', .08, 2.2); break;
        case 'miniboss_attack': t(82, .3, 'sawtooth', .11, 2.6); this.noise(.12, .055, { frequency: 500 }); break;
        case 'boss_enter': this.duck(900, .18); t(48, .9, 'sawtooth', .16, 2.8); this.noise(.45, .1, { frequency: 420 }); break;
        case 'boss_fight': t(72, .42, 'square', .1, 1.7); break;
        case 'boss_attack': this.duck(260, .62); t(64, .28, 'sawtooth', .12, 3.2); break;
        case 'boss_phase': this.duck(1100, .16); t(52, .9, 'sawtooth', .17, 4.2); this.noise(.5, .12, { frequency: 520 }); break;
        case 'boss_part_destroy': this.duck(500, .35); t(68, .48, 'sawtooth', .14, .24); this.noise(.35, .14, { frequency: 760 }); break;
        case 'boss_heavy_hit': t(58, .18, 'square', .09, .45); this.noise(.1, .05, { frequency: 650 }); break;
        case 'boss_summon': t(110, .45, 'triangle', .1, 3.1); break;
        case 'boss_defeat': this.duck(1800, .08); t(45, 1.3, 'sawtooth', .18, .16); this.noise(.9, .16, { frequency: 560 }); break;
        case 'ui_move': t(520, .035, 'sine', .022, 1.2); break;
        case 'ui_confirm': t(390, .09, 'triangle', .055, 1.7); break;
        case 'ui_cancel': t(330, .1, 'triangle', .045, .62); break;
        case 'ui_pause': t(220, .14, 'square', .05, .5); break;
        case 'ui_resume': t(220, .14, 'square', .05, 2); break;
        case 'ui_start': this.duck(350, .42); t(165, .32, 'sawtooth', .09, 3); break;
        case 'ui_victory': [330, 440, 554, 660].forEach((note, i) => setTimeout(() => this.tone(note, .45, 'triangle', .08, 1.08), i * 110)); break;
        case 'ui_gameover': t(220, .8, 'sawtooth', .1, .22); break;
        default: t(300, .08, 'sine', .04, 1); return false;
      }
      return true;
    }

    musicConfig(theme, section) {
      const configs = {
        menu: { tempo: 430, bass: [82, 110, 123, 98], lead: [330, 0, 392, 440], type: 'triangle', volume: .026 },
        flight: { tempo: 300, bass: [82, 123, 110, 147, 98, 123], lead: [330, 392, 440, 392, 494, 440], type: 'triangle', volume: .025 },
        devourer: { tempo: section >= 3 ? 205 : 255, bass: [55, 55, 82, 73, 55, 110], lead: [220, 196, 247, 165, 294, 220], type: 'sawtooth', volume: .034 + section * .004 },
        mothership: { tempo: section >= 3 ? 175 : 225, bass: [46, 69, 92, 58, 103, 69], lead: [185, 277, 233, 311, 370, 277], type: 'sawtooth', volume: .04 + section * .004 },
        victory: { tempo: 440, bass: [110, 147, 165, 220], lead: [440, 554, 660, 880], type: 'triangle', volume: .032 },
        gameover: { tempo: 620, bass: [82, 73, 65, 55], lead: [220, 196, 165, 147], type: 'sine', volume: .028 }
      };
      return configs[theme] || configs.flight;
    }

    stopMusicNodes() { for (const node of this.musicNodes) { try { node.stop(); } catch (_) { /* ya detenido */ } } this.musicNodes.clear(); }

    setMusic(theme, section = 1) {
      if (!this.ctx) { this.musicTheme = theme; this.musicSection = section; return; }
      if (this.musicTheme === theme && this.musicSection === section && this.musicTimer) return;
      this.musicTheme = theme; this.musicSection = section; const token = ++this.musicToken;
      clearInterval(this.musicTimer); this.stopMusicNodes(); this.musicStep = 0;
      const fileKey = `music_${theme}${section > 1 ? `_phase${section}` : ''}`, file = this.buffers.get(fileKey);
      if (file) { const source = this.ctx.createBufferSource(); source.buffer = file; source.loop = true; source.connect(this.musicBus); source.start(); this.musicNodes.add(source); source.onended = () => this.musicNodes.delete(source); return; }
      const config = this.musicConfig(theme, section), tick = () => {
        if (token !== this.musicToken || this.settings.muted) return; const step = this.musicStep++, bass = config.bass[step % config.bass.length], lead = config.lead[step % config.lead.length];
        this.tone(bass, config.tempo / 1000 * .82, config.type, config.volume, 1, { music: true });
        if (lead && step % 2 === 0) this.tone(lead, config.tempo / 1000 * 1.35, 'sine', config.volume * .55, 1, { music: true });
      };
      tick(); this.musicTimer = setInterval(tick, config.tempo);
    }

    duck(duration = 600, factor = .3) {
      if (!this.ctx || this.settings.muted) return; clearTimeout(this.duckTimer); const now = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now); this.musicBus.gain.setTargetAtTime(this.settings.music * factor, now, .025);
      this.duckTimer = setTimeout(() => { if (!this.ctx) return; this.musicBus.gain.setTargetAtTime(this.settings.music, this.ctx.currentTime, .12); }, duration);
    }

    pauseMusic() { if (this.ctx) this.musicBus.gain.setTargetAtTime(this.settings.music * .25, this.ctx.currentTime, .08); }
    resumeMusic() { if (this.ctx) this.musicBus.gain.setTargetAtTime(this.settings.music, this.ctx.currentTime, .12); }
    debug() { return { initialized: Boolean(this.ctx), theme: this.musicTheme, section: this.musicSection, musicLoop: Boolean(this.musicTimer), voices: this.voices, buffers: this.buffers.size, settings: { ...this.settings } }; }
  }

  window.VoidAudio = new VoidAudioManager();
})();
