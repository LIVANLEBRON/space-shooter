(() => {
  'use strict';

  const canvas = document.querySelector('#canvas');
  const ctx = canvas.getContext('2d');
  const $ = selector => document.querySelector(selector);
  const ui = {
    hud: $('#hud'), start: $('#startScreen'), controls: $('#controlsScreen'), pause: $('#pauseScreen'),
    upgrades: $('#upgradeScreen'), gameOver: $('#gameOverScreen'), victory: $('#victoryScreen'), options: $('#optionsScreen'), ranking: $('#rankingScreen'), confirm: $('#confirmScreen'),
    score: $('#score'), finalScore: $('#finalScore'), victoryScore: $('#victoryScore'), reason: $('#gameOverReason'),
    level: $('#levelNumber'), levelName: $('#levelName'), notice: $('#levelNotice'), noticeNumber: $('#levelNoticeNumber'),
    noticeName: $('#levelNoticeName'), noticeSubtitle: $('#levelSubtitle'), gamepadCount: $('#gamepadCount'),
    controller: $('#controllerStatus'), playerHud: $('#playerHud'), bossHud: $('#bossHud'), bossName: $('#bossName'),
    bossPhase: $('#bossPhase'), bossBar: $('#bossBar'), objectiveHud: $('#objectiveHud'), objectiveBar: $('#objectiveBar'),
    upgradeChoices: $('#upgradeChoices'), calibrationStatus: $('#p2CalibrationStatus'), toast: $('#combatToast'),
    combo: $('#comboDisplay'), comboValue: $('#comboValue'), synergy: $('#synergyDisplay'),
    musicVolume: $('#musicVolume'), sfxVolume: $('#sfxVolume'), muteButton: $('#muteButton')
  };

  const LEVELS = [
    { name: 'INTERCEPCIÓN', subtitle: 'DOMINA MOVIMIENTO, DISPARO Y DASH', queue: { basic: 8 } },
    { name: 'ATAQUE EN DIAGONAL', subtitle: 'CONTACTOS DESDE LOS LATERALES', queue: { basic: 6, fast: 7, shooter: 2 } },
    { name: 'CAMPO DE ASTEROIDES', subtitle: 'TRAYECTORIAS INESTABLES', queue: { basic: 7, fast: 4, shooter: 2 }, asteroids: true },
    { name: 'TORMENTA ESPACIAL', subtitle: 'CARGA ELÉCTRICA DETECTADA', queue: { basic: 7, fast: 5, shooter: 3 }, storm: true },
    { name: 'EL DEVORADOR', subtitle: 'FIRMA MASIVA APROXIMÁNDOSE', boss: 'devourer' },
    { name: 'INFILTRACIÓN', subtitle: 'ENTRANDO EN LA FORTALEZA', queue: { basic: 5, fast: 4, shooter: 5, tank: 2 }, corridor: true },
    { name: 'DEFENSA DEL NÚCLEO', subtitle: 'PROTEGE LA NAVE ALIADA', queue: { basic: 10, fast: 7, shooter: 5, tank: 2 }, defense: true },
    { name: 'FLOTA ENEMIGA', subtitle: 'FORMACIÓN HOSTIL COMPLETA', queue: { basic: 14, fast: 10, shooter: 7, tank: 5, miniboss: 2 } },
    { name: 'ASALTO FINAL', subtitle: 'SOBRECARGA DE ARMAMENTO', queue: { basic: 14, fast: 12, shooter: 10, tank: 6, miniboss: 2 }, boost: true, storm: true },
    { name: 'NAVE MADRE', subtitle: 'DESTRUYE ARMAS, MOTORES Y NÚCLEO', boss: 'mothership' }
  ];

  const UPGRADES = {
    damage: ['MÁS DAÑO', '+35% de daño principal'], double: ['DOBLE DISPARO', 'Añade cañones laterales'],
    speed: ['MAYOR VELOCIDAD', '+18% de velocidad'], shield: ['ESCUDO', 'Absorbe un impacto por nivel'],
    dash: ['DASH EXPERTO', '-25% de recarga'], ulti: ['CARGA DE ULTI', '+35% de carga obtenida'],
    missiles: ['MISILES', 'El especial lanza misiles guiados'], health: ['MAYOR VIDA', '+30 de vida máxima'],
    perfect: ['VENTANA PERFECTA', 'Perfect Dash da más ulti y recarga'], rapid: ['CADENCIA VECTORIAL', '+22% de cadencia de disparo'],
    armor: ['BLINDAJE REACTIVO', '-18% de daño recibido'], comboCore: ['NÚCLEO DE COMBO', 'Los combos cargan más ulti'],
    wingLink: ['ENLACE DE ESCUADRÓN', 'Mayor bonificación al volar juntos']
  };

  const state = {
    mode: 'menu', pausedFrom: 'playing', playerCount: 1, level: 0, score: 0, time: 0, lastTime: 0,
    levelTimer: 0, spawnTimer: 0, shake: 0, flash: 0, combo: 0, comboTimer: 0, gamepads: [],
    keys: new Set(), previousButtons: new Map(), queue: [], enemies: [], bullets: [], enemyBullets: [],
    obstacles: [], hazards: [], particles: [], trails: [], pickups: [], stars: [], boss: null, objective: null,
    environmentTimer: 0, levelClearPending: false, upgrades: [], diagnostic: false, spawnSerial: 0,
    hitFlashes: [], toastTimer: 0, phaseFlash: 0, synergy: false, musicTheme: '',
    p2Mapping: { dash: 4, ulti: 5, special: 6 }, p2Calibration: null, boss5Defeated: false, finalBossDefeated: false
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const random = (min, max) => Math.random() * (max - min) + min;
  const shuffle = array => { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } return array; };
  const overlaps = (a, b) => a.x - a.w / 2 < b.x + b.w / 2 && a.x + a.w / 2 > b.x - b.w / 2 && a.y - a.h / 2 < b.y + b.h / 2 && a.y + a.h / 2 > b.y - b.h / 2;
  const activePlayers = () => state.players.filter(player => player.active && !player.dead);
  const targetPlayer = source => { const list = activePlayers(); return list.length ? list.reduce((best, p) => Math.hypot(p.x - source.x, p.y - source.y) < Math.hypot(best.x - source.x, best.y - source.y) ? p : best) : null; };

  function makePlayer(id) {
    return {
      id, active: id === 0, dead: false, x: innerWidth * (id ? .58 : .42), y: innerHeight * .82,
      w: 34, h: 46, color: id ? '#cf8aff' : '#42f5e9', accent: id ? '#8754de' : '#3d7cff',
      speed: 420, maxHealth: 100, health: 100, damage: 1, shotCooldown: 0, invulnerable: 0,
      dashCooldown: 0, dashDuration: 0, dashX: 0, dashY: -1, dashBase: 720, trailTimer: 0,
      lastX: 0, lastY: -1, ulti: 0, ultiGain: 1, specialCooldown: 0, shield: 0,
      doubleShot: false, missiles: false, temporaryBoost: 0, vx: 0, vy: 0, reviveProgress: 0,
      perfectPower: 1, fireRate: 1, armor: 1, comboPower: 1, linkPower: 1
    };
  }
  state.players = [makePlayer(0), makePlayer(1)];

  const audio = window.VoidAudio;
  function initAudio() { return audio.init(); }
  function sfx(name, options = {}) { return audio.play(name, options); }
  function setMusic(theme = 'flight', section = 1) { state.musicTheme = theme; return audio.setMusic(theme, section); }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = `${innerWidth}px`; canvas.style.height = `${innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); createStars();
    state.players.forEach(p => { p.x = clamp(p.x || innerWidth / 2, 24, innerWidth - 24); p.y = clamp(p.y || innerHeight * .82, playTop(), innerHeight - 28); });
  }
  const playTop = () => state.level === 5 ? innerHeight * .34 : innerHeight * .42;
  function createStars() { state.stars = Array.from({ length: Math.min(180, Math.floor(innerWidth * innerHeight / 6500)) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, size: random(.4, 1.8), speed: random(12, 70), alpha: random(.2, .85) })); }

  function connectedPads() { return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; }
  function updatePadDisplay() {
    const pads = connectedPads(); state.gamepads = pads;
    ui.gamepadCount.textContent = `● ${pads.length} MANDO${pads.length === 1 ? '' : 'S'} DETECTADO${pads.length === 1 ? '' : 'S'}`;
    ui.gamepadCount.classList.toggle('active', pads.length > 0);
    ui.controller.textContent = `⌨ TECLADO · ${pads.length} MANDO${pads.length === 1 ? '' : 'S'}`;
  }

  function p2PadFrom(pads = connectedPads()) { return pads.length >= 2 ? pads[1] : pads[0] || null; }
  function mappingStorageKey(pad) { return `void-runner-p2-${pad.id}`; }
  function loadP2Mapping() {
    const pad = p2PadFrom(); if (!pad) return;
    state.p2Mapping = { dash: 4, ulti: 5, special: 6 };
    try { const saved = JSON.parse(localStorage.getItem(mappingStorageKey(pad))); if (saved && ['dash', 'ulti', 'special'].every(key => Number.isInteger(saved[key]))) state.p2Mapping = saved; } catch (_) { /* almacenamiento opcional */ }
  }
  function startP2Calibration() {
    const pad = p2PadFrom();
    if (!pad) { ui.calibrationStatus.textContent = 'Conecta el mando de J2 antes de calibrar.'; return; }
    state.p2Calibration = { padId: pad.id, padSlot: connectedPads().length >= 2 ? 1 : 0, step: 0, waitingRelease: true, map: {}, actions: [['dash', 'LB para DASH'], ['ulti', 'RB para ULTI'], ['special', 'LT para ESPECIAL']] };
    ui.calibrationStatus.textContent = 'Suelta todos los botones del mando J2…';
  }
  function pollP2Calibration() {
    const calibration = state.p2Calibration; if (!calibration) return;
    const pad = connectedPads()[calibration.padSlot]; if (!pad || pad.id !== calibration.padId) { ui.calibrationStatus.textContent = 'Se desconectó el mando J2.'; state.p2Calibration = null; return; }
    const pressed = pad.buttons.map((button, index) => button.pressed || button.value > .55 ? index : -1).filter(index => index >= 0);
    if (calibration.waitingRelease) {
      if (!pressed.length) { calibration.waitingRelease = false; ui.calibrationStatus.textContent = `Pulsa ${calibration.actions[calibration.step][1]}.`; }
      return;
    }
    if (!pressed.length) return;
    const [key] = calibration.actions[calibration.step]; calibration.map[key] = pressed[0]; calibration.step++; calibration.waitingRelease = true;
    if (calibration.step < calibration.actions.length) { ui.calibrationStatus.textContent = 'Suelta el botón…'; return; }
    state.p2Mapping = calibration.map;
    try { localStorage.setItem(mappingStorageKey(pad), JSON.stringify(calibration.map)); } catch (_) { /* almacenamiento opcional */ }
    ui.calibrationStatus.textContent = 'Mando J2 calibrado: LB = dash · RB = ulti · LT = especial.'; state.p2Calibration = null;
  }

  function showScreen(screen) { [ui.start, ui.controls, ui.options, ui.ranking, ui.pause, ui.confirm, ui.upgrades, ui.gameOver, ui.victory].forEach(s => { const on = s === screen; s.classList.toggle('visible', on); s.setAttribute('aria-hidden', String(!on)); }); dispatchEvent(new CustomEvent('void-screen-change', { detail: { id: screen?.id || null } })); }
  function returnToMenu() { state.mode = 'menu'; state.boss = null; setMusic('menu'); sfx('ui_cancel'); showScreen(ui.start); updatePadDisplay(); }

  function startCampaign(count) {
    sfx('ui_start');
    state.playerCount = count; state.level = 0; state.score = 0; state.upgrades = []; state.boss5Defeated = false; state.finalBossDefeated = false;
    state.players = [makePlayer(0), makePlayer(1)]; state.players[1].active = count === 2;
    $('#p2Hud').classList.toggle('hidden', count !== 2); document.querySelectorAll('.pilot-profile').forEach((card, index) => card.classList.toggle('selected', index < count && index < 2)); dispatchEvent(new CustomEvent('void-player-count', { detail: { count } })); loadP2Mapping(); showScreen(null); startLevel(1); dispatchEvent(new Event('void-game-started')); updateHud();
  }

  function buildQueue(config) { const queue = []; Object.entries(config || {}).forEach(([type, count]) => { for (let i = 0; i < count; i++) queue.push(type); }); return shuffle(queue); }
  function startLevel(number) {
    const level = LEVELS[number - 1]; state.level = number; state.mode = 'intro'; state.levelTimer = 2100;
    state.time = 0; state.spawnTimer = 250; state.environmentTimer = 900; state.queue = buildQueue(level.queue);
    state.enemies = []; state.bullets = []; state.enemyBullets = []; state.obstacles = []; state.hazards = [];
    state.pickups = []; state.hitFlashes = []; state.boss = null; state.phaseFlash = 0; state.objective = level.defense ? { x: innerWidth / 2, y: innerHeight * .56, w: 90, h: 72, health: 180 * (state.playerCount === 2 ? 1.35 : 1), maxHealth: 180 * (state.playerCount === 2 ? 1.35 : 1) } : null;
    state.levelClearPending = false; state.players.forEach((p, index) => { if (!p.active) return; p.dead = false; p.health = Math.max(p.health, p.maxHealth * .65); p.x = innerWidth * (state.playerCount === 2 ? (index ? .58 : .42) : .5); p.y = innerHeight * .82; p.invulnerable = 1300; p.temporaryBoost = level.boost ? 15000 : 0; p.ulti = level.boost ? 100 : p.ulti; if (p.shield < 1 && state.upgrades.includes('shield')) p.shield = 1; });
    ui.level.textContent = number; ui.levelName.textContent = level.name; ui.noticeNumber.textContent = number;
    ui.noticeName.textContent = level.name; ui.noticeSubtitle.textContent = level.subtitle; ui.notice.classList.add('visible');
    ui.objectiveHud.classList.toggle('visible', Boolean(state.objective)); ui.bossHud.classList.remove('visible'); updateHud();
  }

  function enterLevel() {
    state.mode = 'playing'; ui.notice.classList.remove('visible'); setMusic(LEVELS[state.level - 1].boss || 'flight');
    if (LEVELS[state.level - 1].boss) spawnBoss(LEVELS[state.level - 1].boss);
    if (state.level === 3) for (let i = 0; i < 4; i++) spawnAsteroid(i * innerHeight / 4);
    if (state.level === 6) spawnInfiltration();
  }

  function completeLevel() {
    if (state.levelClearPending) return; state.levelClearPending = true; state.mode = 'levelclear'; state.levelTimer = 1800;
    state.enemyBullets = []; state.players.forEach(p => { if (p.active && p.dead) { p.dead = false; p.health = p.maxHealth * .55; } if (p.active) p.invulnerable = 2000; });
    ui.noticeSubtitle.textContent = 'SECTOR ASEGURADO'; ui.noticeNumber.textContent = state.level; ui.noticeName.textContent = 'NIVEL COMPLETADO'; ui.notice.classList.add('visible');
    submitRecord(false);
  }

  function advanceAfterClear() {
    if (state.level === 10) return victory();
    if ([2, 5, 7, 9].includes(state.level)) return showUpgradeSelection();
    startLevel(state.level + 1);
  }

  function showUpgradeSelection() {
    state.mode = 'upgrade'; const available = shuffle(Object.keys(UPGRADES).filter(key => !state.upgrades.includes(key))).slice(0, 3);
    if (!available.length) return startLevel(state.level + 1);
    ui.upgradeChoices.replaceChildren(...available.map(key => { const button = document.createElement('button'); button.className = 'upgrade-choice'; button.dataset.upgrade = key; button.innerHTML = `<span>MEJORA</span><b>${UPGRADES[key][0]}</b><small>${UPGRADES[key][1]}</small>`; return button; }));
    showScreen(ui.upgrades);
  }

  function chooseUpgrade(key) {
    sfx('pickup_upgrade');
    state.upgrades.push(key); state.players.forEach(p => {
      if (key === 'damage') p.damage *= 1.35; if (key === 'double') p.doubleShot = true;
      if (key === 'speed') p.speed *= 1.18; if (key === 'dash') p.dashBase *= .75;
      if (key === 'ulti') p.ultiGain *= 1.35; if (key === 'missiles') p.missiles = true;
      if (key === 'health') { p.maxHealth += 30; p.health += 30; } if (key === 'shield') p.shield++;
      if (key === 'perfect') p.perfectPower *= 1.5; if (key === 'rapid') p.fireRate *= 1.22;
      if (key === 'armor') p.armor *= .82; if (key === 'comboCore') p.comboPower *= 1.45;
      if (key === 'wingLink') p.linkPower *= 1.6;
    }); if (key === 'shield') state.players.filter(p => p.active).forEach(p => sfx('player_shield', { player: p.id })); if (key === 'health') state.players.filter(p => p.active).forEach(p => sfx('player_heal', { player: p.id })); showScreen(null); startLevel(state.level + 1);
  }

  function submitRecord(completed = false) { if (!window.VoidRanking) return; window.VoidRanking.submit({ name: localStorage.getItem('spaceShooter.player1Name') || localStorage.getItem('void-runner-pilot-name') || 'Piloto 1', highestLevel: state.level, maxScore: Math.floor(state.score), boss5Defeated: state.boss5Defeated, finalBossDefeated: state.finalBossDefeated, campaignCompleted: completed, playerCount: state.playerCount }).then(() => dispatchEvent(new Event('void-ranking-updated'))).catch(() => {}); }
  function gameOver(reason = 'El escuadrón fue destruido.') { state.mode = 'gameover'; submitRecord(false); setMusic('gameover'); sfx('ui_gameover'); ui.reason.textContent = reason; ui.finalScore.textContent = String(state.score).padStart(6, '0'); showScreen(ui.gameOver); }
  function victory() { state.mode = 'victory'; state.finalBossDefeated = true; submitRecord(true); state.flash = 1000; setMusic('victory'); sfx('ui_victory'); ui.victoryScore.textContent = String(state.score).padStart(6, '0'); showScreen(ui.victory); }
  function togglePause() { if (!['playing', 'intro', 'paused'].includes(state.mode)) return; if (state.mode === 'paused') { state.mode = state.pausedFrom; audio.resumeMusic(); sfx('ui_resume'); showScreen(null); } else { state.pausedFrom = state.mode; state.mode = 'paused'; state.keys.clear(); audio.pauseMusic(); sfx('ui_pause'); showScreen(ui.pause); } }

  function enemyStats(type) {
    const scale = (1 + (state.level - 1) * .08) * (state.playerCount === 2 ? 1.35 : 1);
    const data = {
      basic: [36, 38, 2, 105, 100, '#ff426f'], fast: [27, 31, 1, 220, 150, '#d45cff'],
      shooter: [42, 42, 4, 90, 250, '#ff9d42'], tank: [57, 55, 10, 65, 400, '#ff6a55'],
      turret: [44, 44, 6, 0, 300, '#ff9d42'], miniboss: [92, 82, 30, 48, 1200, '#ff3f87']
    }[type]; return { w: data[0], h: data[1], hp: Math.ceil(data[2] * scale), maxHp: Math.ceil(data[2] * scale), speed: data[3] * (1 + state.level * .025), score: data[4], color: data[5] };
  }

  function spawnEnemy(type = state.queue.shift()) {
    if (!type) return null; const t = enemyStats(type); const side = Math.random() > .5 ? 1 : -1;
    const patterns = state.level < 2 ? ['direct'] : state.level < 5 ? ['direct', 'burst'] : ['direct', 'burst', 'fan'];
    const serial = state.spawnSerial++, groupId = Math.floor(serial / 3);
    const behavior = type === 'fast' ? 'flank' : type === 'shooter' && Math.random() < .35 ? 'protector' : type === 'basic' ? ['zigzag', 'chase', 'formation'][serial % 3] : 'steady';
    const enemy = { ...t, type, x: type === 'fast' ? (side > 0 ? 18 : innerWidth - 18) : random(t.w, innerWidth - t.w), y: type === 'turret' ? random(120, innerHeight * .38) : -t.h,
      vx: type === 'fast' ? -side * 160 : 0, targetY: random(110, Math.min(245, innerHeight * .36)), phase: random(0, 6.28), age: 0,
      shootTimer: random(state.level === 1 ? 2300 : 900, state.level === 1 ? 3600 : 1700) + (serial % 3) * 120, pattern: state.level === 2 ? 'direct' : patterns[Math.floor(Math.random() * patterns.length)],
      canShoot: (type === 'basic' && Math.random() < (state.level === 1 ? .2 : .34)) || (type === 'fast' && state.level >= 2 && Math.random() < .42),
      behavior, groupId, guardTarget: null, burstLeft: 0, burstTimer: 0, targetObjective: state.level === 7 && Math.random() < .55 };
    state.enemies.push(enemy); if (['tank', 'miniboss'].includes(type)) sfx('enemy_special_spawn', { x: enemy.x }); return enemy;
  }

  function fireEnemy(source, pattern = source.pattern, target = null) {
    target ||= source.targetObjective && state.objective ? state.objective : targetPlayer(source); if (!target) return;
    const prediction = source.type === 'shooter' || source.type === 'miniboss' ? .34 : .16;
    const aimX = target.x + (target.vx || 0) * prediction, aimY = target.y + (target.vy || 0) * prediction;
    const base = Math.atan2(aimY - source.y, aimX - source.x); const speed = 230 + state.level * 9;
    const shot = offset => state.enemyBullets.push({ x: source.x, y: source.y + source.h * .3, w: 9, h: 9, vx: Math.cos(base + offset) * speed, vy: Math.sin(base + offset) * speed, damage: source.type === 'miniboss' ? 15 : 10, color: '#ffd166' });
    if (pattern === 'fan') [-.36, -.18, 0, .18, .36].forEach(shot); else if (pattern === 'burst') { shot(0); source.burstLeft = 2; source.burstTimer = 110; } else shot(0);
    sfx(source.type === 'miniboss' ? 'miniboss_attack' : source.type === 'tank' ? 'enemy_shoot_heavy' : 'enemy_shoot', { x: source.x });
    source.shootTimer = random(1250, 2100) * Math.max(.55, 1 - state.level * .025);
  }

  function spawnAsteroid(y = -60) { const big = Math.random() < .65; state.obstacles.push({ type: 'asteroid', x: random(45, innerWidth - 45), y, w: big ? 70 : 42, h: big ? 70 : 42, hp: big ? 8 : 3, destructible: Math.random() < .7, speed: random(75, 145), spin: random(-2, 2), angle: random(0, 6.28) }); }
  function spawnInfiltration() { for (const x of [innerWidth * .24, innerWidth * .76]) { const e = spawnEnemy('turret'); e.x = x; e.y = innerHeight * .25; e.targetY = e.y; } state.hazards.push({ type: 'laser', x: innerWidth / 2, y: innerHeight * .46, w: innerWidth * .42, h: 10, timer: 1800, active: false, duration: 850, permanent: true }); }

  function spawnStormHazard() {
    const vertical = Math.random() > .5; state.hazards.push({ type: 'electric', x: random(innerWidth * .18, innerWidth * .82), y: random(innerHeight * .5, innerHeight * .84), w: vertical ? 70 : innerWidth * .36, h: vertical ? innerHeight * .48 : 70, timer: 1300, active: false, duration: 720, permanent: false });
  }

  function spawnBoss(type) {
    if (type === 'devourer') state.boss = { type, name: 'EL DEVORADOR', x: innerWidth / 2, y: 165, w: Math.min(390, innerWidth * .48), h: 190, health: 430 * (state.playerCount === 2 ? 1.6 : 1), maxHealth: 430 * (state.playerCount === 2 ? 1.6 : 1), phase: 1, lastPhase: 1, timer: 1100, summonTimer: 5000, splitTimer: 0, copies: [] };
    else { const coopScale = state.playerCount === 2 ? 1.65 : 1; state.boss = { type, name: 'NAVE MADRE OMEGA', x: innerWidth / 2, y: 170, w: Math.min(620, innerWidth * .72), h: 235, health: 900 * coopScale, maxHealth: 900 * coopScale, phase: 1, lastPhase: 1, timer: 1000, summonTimer: 4500, parts: [
      { id: 'arma-i', x: -.32, y: .05, hp: 120, maxHp: 120, color: '#ff426f' }, { id: 'arma-d', x: .32, y: .05, hp: 120, maxHp: 120, color: '#ff426f' }, { id: 'motor', x: 0, y: -.28, hp: 160, maxHp: 160, color: '#ff9d42' }, { id: 'núcleo', x: 0, y: .16, hp: 500, maxHp: 500, color: '#42f5e9', locked: true }
    ].map(part => ({ ...part, hp: part.hp * coopScale, maxHp: part.maxHp * coopScale })) }; }
    ui.bossName.textContent = state.boss.name; ui.bossHud.classList.add('visible'); sfx('boss_enter'); sfx('boss_fight'); updateHud();
  }

  function bossShot(angle, speed = 245, x = state.boss.x, y = state.boss.y) { state.enemyBullets.push({ x, y, w: 11, h: 11, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, damage: 13, color: '#ff7b54' }); }
  function radialBossShot(count, speed = 240) { for (let i = 0; i < count; i++) bossShot(i / count * Math.PI * 2 + state.time / 900, speed); }
  function aimedBossShot(count = 3) { const target = targetPlayer(state.boss); if (!target) return; const angle = Math.atan2(target.y - state.boss.y, target.x - state.boss.x); for (let i = 0; i < count; i++) bossShot(angle + (i - (count - 1) / 2) * .18, 270); }
  function bossPhaseTransition(b) {
    if (b.phase === b.lastPhase) return; b.lastPhase = b.phase; b.timer = 900; state.phaseFlash = 700; state.shake = 16; state.enemyBullets = state.enemyBullets.filter((_, i) => i % 3 === 0);
    burst(b.x, b.y, b.type === 'mothership' ? 85 : 60, b.phase === 3 ? '#42f5e9' : '#ff426f', 420, true); sfx('boss_phase'); setMusic(b.type, b.phase);
    ui.toast.querySelector('strong').textContent = `FASE ${b.phase}`; ui.toast.querySelector('small').textContent = b.type === 'mothership' ? 'NÚCLEO DE LA NAVE MADRE' : 'EL DEVORADOR EVOLUCIONA'; ui.toast.classList.add('visible'); state.toastTimer = 1200;
  }
  function bossCrossAttack() {
    state.hazards.push({ type: 'laser', x: innerWidth / 2, y: innerHeight * .62, w: innerWidth, h: 24, timer: 720, active: false, duration: 520, permanent: false }, { type: 'laser', x: innerWidth / 2, y: innerHeight * .58, w: 24, h: innerHeight, timer: 720, active: false, duration: 520, permanent: false });
  }

  function updateBoss(dt) {
    const b = state.boss; if (!b) return; b.timer -= dt * 1000; b.summonTimer -= dt * 1000; b.x = innerWidth / 2 + Math.sin(state.time / 1300) * innerWidth * .13;
    if (b.type === 'devourer') {
      const ratio = b.health / b.maxHealth; b.phase = ratio > .66 ? 1 : ratio > .32 ? 2 : 3; bossPhaseTransition(b);
      if (b.timer <= 0) { sfx('boss_attack'); if (b.phase === 1) { aimedBossShot(3); bossShot(Math.PI * .68, 230); bossShot(Math.PI * .32, 230); } else if (b.phase === 2) radialBossShot(12, 245); else { radialBossShot(18, 265); aimedBossShot(5); if (Math.random() < .45) bossCrossAttack(); } b.timer = b.phase === 3 ? 780 : 1180; }
      if (b.phase === 2 && !b.copies.length && b.splitTimer <= 0) { b.copies = [-1, 1].map(side => ({ x: b.x + side * b.w * .5, y: b.y + 45, w: 90, h: 65, timer: 500, life: 4800 })); b.splitTimer = 9000; }
      b.splitTimer -= dt * 1000; b.copies.forEach(c => { c.life -= dt * 1000; c.timer -= dt * 1000; c.x += Math.sin(state.time / 400 + c.x) * 70 * dt; if (c.timer <= 0) { const target = targetPlayer(c); if (target) bossShot(Math.atan2(target.y - c.y, target.x - c.x), 285, c.x, c.y); c.timer = 700; } }); b.copies = b.copies.filter(c => c.life > 0);
      if (b.summonTimer <= 0) { sfx('boss_summon'); spawnEnemy(Math.random() > .5 ? 'fast' : 'basic'); spawnEnemy('basic'); b.summonTimer = 5200; }
      if (b.phase === 3 && b.timer < 100) telegraphArea(targetPlayer(b));
    } else {
      const alive = b.parts.filter(p => p.hp > 0); const core = b.parts.find(p => p.id === 'núcleo'); const externals = b.parts.filter(p => p.id !== 'núcleo' && p.hp > 0);
      core.locked = externals.length > 0; b.phase = externals.length >= 2 ? 1 : externals.length ? 2 : 3; bossPhaseTransition(b);
      b.health = b.parts.reduce((sum, part) => sum + Math.max(0, part.hp), 0); b.maxHealth = b.parts.reduce((sum, part) => sum + part.maxHp, 0);
      b.parts.filter(part => part.hp <= 0).forEach(part => { if (Math.random() < dt * 4) burst(b.x + part.x * b.w, b.y + part.y * b.h, 2, '#ff7b54', 90); });
      if (b.timer <= 0) { sfx('boss_attack'); if (b.phase === 1) { aimedBossShot(5); bossShot(Math.PI * .75, 280, b.x - b.w * .3, b.y); bossShot(Math.PI * .25, 280, b.x + b.w * .3, b.y); } else if (b.phase === 2) { radialBossShot(16, 255); if (Math.random() < .5) bossCrossAttack(); } else { radialBossShot(22, 280); aimedBossShot(7); telegraphArea(targetPlayer(b)); bossCrossAttack(); } b.timer = b.phase === 3 ? 680 : 980; }
      if (b.summonTimer <= 0 && alive.length) { sfx('boss_summon'); spawnEnemy(b.phase === 1 ? 'fast' : 'shooter'); spawnEnemy('basic'); b.summonTimer = 4300; }
    }
    updateHud();
  }

  function telegraphArea(target) { if (!target || state.hazards.some(h => h.type === 'area')) return; state.hazards.push({ type: 'area', x: target.x, y: target.y, w: 150, h: 150, timer: 900, active: false, duration: 500, permanent: false }); }

  function playerDirection(player, pad) {
    let x = 0, y = 0; if (player.id === 0) { if (state.keys.has('a') || state.keys.has('arrowleft')) x--; if (state.keys.has('d') || state.keys.has('arrowright')) x++; if (state.keys.has('w') || state.keys.has('arrowup')) y--; if (state.keys.has('s') || state.keys.has('arrowdown')) y++; }
    if (player.id === 0) { const mobile = window.VoidMobile?.getVector(); if (mobile?.active) { x = mobile.x; y = mobile.y; } }
    if (pad) { const px = Math.abs(pad.axes[0] || 0) > .18 ? pad.axes[0] : 0; const py = Math.abs(pad.axes[1] || 0) > .18 ? pad.axes[1] : 0; if (px || py) { x = px; y = py; } }
    const length = Math.hypot(x, y); return length ? { x: x / Math.max(1, length), y: y / Math.max(1, length) } : { x: 0, y: 0 };
  }

  function padForPlayer(index) { if (!state.gamepads.length) return null; if (state.playerCount === 2) return state.gamepads.length >= 2 ? state.gamepads[index] : (index === 1 ? state.gamepads[0] : null); return state.gamepads[0]; }
  function padPressed(pad, button) { return Boolean(pad?.buttons[button]?.pressed); }
  function padJustPressed(player, pad, button) { const key = `${player.id}-${button}`; const pressed = padPressed(pad, button); const old = state.previousButtons.get(key) || false; state.previousButtons.set(key, pressed); return pressed && !old; }

  function dash(player, direction = null) {
    if (!player || player.dead || state.mode !== 'playing' || player.dashCooldown > 0) return false; direction ||= playerDirection(player, padForPlayer(player.id));
    player.dashX = direction.x || (!direction.y ? player.lastX : 0); player.dashY = direction.y || (!direction.x ? player.lastY : 0); if (!player.dashX && !player.dashY) player.dashY = -1;
    const length = Math.hypot(player.dashX, player.dashY); player.dashX /= length; player.dashY /= length; player.dashDuration = 140; player.dashCooldown = player.dashBase; player.invulnerable = Math.max(player.invulnerable, 195); player.trailTimer = 0; burst(player.x, player.y, 20, player.color, 210, true); sfx('player_dash', { player: player.id }); return true;
  }

  function perfectDash(player, bullet) {
    player.dashCooldown = Math.max(110, player.dashCooldown - 250 * player.perfectPower); gainUlti(player, 5 * player.perfectPower);
    if (state.synergy) { const teammate = state.players.find(p => p.active && !p.dead && p !== player); gainUlti(teammate, 2.5); }
    state.score += 75; state.toastTimer = 850; state.flash = Math.max(state.flash, 110); state.shake = 3;
    ui.toast.querySelector('strong').textContent = 'PERFECT DASH'; ui.toast.querySelector('small').textContent = 'RECARGA + ULTI'; ui.toast.classList.add('visible'); burst(bullet.x, bullet.y, 28, player.color, 280, true); sfx('player_perfect_dash', { player: player.id });
  }

  function playerShoot(player) {
    if (player.dead || player.shotCooldown > 0 || state.mode !== 'playing') return; const boost = player.temporaryBoost > 0;
    const linkDamage = state.synergy ? 1 + .1 * player.linkPower : 1;
    const offsets = player.doubleShot || boost ? [-18, -7, 7, 18] : [-11, 11]; offsets.forEach(offset => state.bullets.push({ owner: player.id, x: player.x + offset, y: player.y - 27, w: 4, h: 18, speed: 800, damage: player.damage * (boost ? 1.7 : 1) * linkDamage, color: player.color }));
    player.shotCooldown = (boost ? 80 : 125) / player.fireRate; burst(player.x, player.y - 28, 3, player.color, 65); sfx(player.doubleShot || boost ? 'player_shoot_double' : 'player_shoot', { player: player.id });
  }

  function special(player) {
    if (!player || player.dead || player.specialCooldown > 0 || state.mode !== 'playing') return false; player.specialCooldown = 5200;
    const targets = [...state.enemies].sort((a, b) => b.y - a.y).slice(0, player.missiles ? 5 : 3);
    if (targets.length) targets.forEach((target, i) => state.bullets.push({ owner: player.id, x: player.x, y: player.y, w: 10, h: 18, speed: 420, damage: player.damage * 4, color: '#ff9d42', missile: true, target, phase: i }));
    else for (const angle of [-.25, 0, .25]) state.bullets.push({ owner: player.id, x: player.x, y: player.y, w: 8, h: 18, speed: 520, damage: player.damage * 3, color: '#ff9d42', vx: Math.sin(angle) * 180 });
    burst(player.x, player.y, 22, '#ff9d42', 190, true); sfx('player_special', { player: player.id }); return true;
  }

  function ultimate(player) {
    if (!player || player.dead || player.ulti < 100 || state.mode !== 'playing') return false; player.ulti = 0; player.invulnerable = 4500; state.flash = 600; state.shake = 12;
    state.enemyBullets = state.enemyBullets.filter(b => { const near = Math.hypot(b.x - player.x, b.y - player.y) < innerWidth * .75; if (near) burst(b.x, b.y, 3, player.color, 90); return !near; });
    state.enemies.forEach(enemy => enemy.hp -= 12 * player.damage);
    for (let i = state.enemies.length - 1; i >= 0; i--) if (state.enemies[i].hp <= 0) destroyEnemy(state.enemies[i], i, player.id);
    if (state.boss) { if (state.boss.type === 'devourer') state.boss.health -= 35 * player.damage; else state.boss.parts.filter(part => !part.locked && part.hp > 0).forEach(part => part.hp -= 22 * player.damage); }
    player.ulti = 0; burst(player.x, player.y, 70, player.color, 420, true); sfx('player_ulti', { player: player.id }); return true;
  }

  function gainUlti(player, amount) { if (player?.active && !player.dead) player.ulti = clamp(player.ulti + amount * player.ultiGain, 0, 100); }
  function damagePlayer(player, amount) {
    if (!player || player.dead || player.invulnerable > 0 || state.mode !== 'playing') return false;
    if (player.shield > 0) { player.shield--; player.invulnerable = 800; burst(player.x, player.y, 20, '#79ffb1', 200, true); sfx('player_shield', { player: player.id }); return false; }
    amount *= player.armor; player.health = Math.max(0, player.health - amount); player.invulnerable = 850; gainUlti(player, amount * .65); state.shake = 9; state.flash = 140; burst(player.x, player.y, 24, '#ff426f', 250, true); sfx('player_damage', { player: player.id });
    if (player.health <= 0) { player.dead = true; burst(player.x, player.y, 50, player.color, 330, true); sfx('player_death', { player: player.id }); if (!activePlayers().length) gameOver(); } return true;
  }

  function separatePlayers() { const [a, b] = state.players; if (!b.active || a.dead || b.dead) return; const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), min = 38; if (distance < min) { const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0, push = (min - distance) / 2; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push; } }

  function updateCoop(dt) {
    const [a, b] = state.players; state.synergy = Boolean(b.active && !a.dead && !b.dead && Math.hypot(a.x - b.x, a.y - b.y) < 155); ui.synergy.classList.toggle('visible', state.synergy);
    if (!b.active) return;
    for (const fallen of state.players.filter(p => p.dead)) {
      const rescuer = state.players.find(p => p.active && !p.dead && p !== fallen);
      if (rescuer && Math.hypot(rescuer.x - fallen.x, rescuer.y - fallen.y) < 82) { fallen.reviveProgress += dt * 1000; if (fallen.reviveProgress >= 1800) { fallen.dead = false; fallen.health = fallen.maxHealth * .42; fallen.invulnerable = 2200; fallen.reviveProgress = 0; burst(fallen.x, fallen.y, 38, '#79ffb1', 260, true); sfx('player_revive', { player: fallen.id }); } } else fallen.reviveProgress = Math.max(0, fallen.reviveProgress - dt * 450);
    }
  }

  function burst(x, y, count, color, speed = 180, ring = false) { for (let i = 0; i < count; i++) { const angle = random(0, 6.28), velocity = random(speed * .3, speed); state.particles.push({ x, y, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity, life: random(260, 700), maxLife: 700, size: random(1.2, 4.6), color, ring: false, streak: Math.random() < .32 }); } if (ring) state.particles.push({ x, y, vx: 0, vy: 0, life: 380, maxLife: 380, size: 6, color, ring: true }); if (state.particles.length > 900) state.particles.splice(0, state.particles.length - 900); }

  function destroyEnemy(enemy, index, owner = 0) {
    state.enemies.splice(index, 1); state.score += enemy.score; state.combo = state.comboTimer > 0 ? state.combo + 1 : 1; state.comboTimer = 1800;
    const killer = state.players[owner]; gainUlti(killer, (5 + state.combo * .7 * killer.comboPower + (enemy.type === 'miniboss' ? 25 : 0)));
    if (state.synergy) gainUlti(state.players.find(p => p.active && !p.dead && p !== killer), 2.2);
    state.shake = enemy.type === 'miniboss' ? 8 : enemy.type === 'tank' ? 6 : 3; state.flash = Math.max(state.flash, enemy.type === 'miniboss' ? 180 : 65);
    const particles = enemy.type === 'miniboss' ? 58 : enemy.type === 'tank' ? 38 : enemy.type === 'fast' ? 16 : 25; burst(enemy.x, enemy.y, particles, enemy.color, enemy.type === 'fast' ? 330 : 270, true); sfx('enemy_destroy', { x: enemy.x, variant: enemy.type });
    if (state.players.some(p => p.active && p.dead) && Math.random() < .16) state.pickups.push({ type: 'revive', x: enemy.x, y: enemy.y, w: 24, h: 24, speed: 65 });
  }

  function updateInputs() {
    updatePadDisplay(); state.players.forEach(player => {
      if (!player.active || player.dead) return; const pad = padForPlayer(player.id);
      if (player.id === 1) {
        if (padJustPressed(player, pad, state.p2Mapping.dash)) dash(player);
        if (padJustPressed(player, pad, state.p2Mapping.special)) special(player);
        if (padJustPressed(player, pad, state.p2Mapping.ulti)) ultimate(player);
      } else {
        if (padJustPressed(player, pad, 1)) dash(player);
        if (padJustPressed(player, pad, 2)) special(player);
        if (padJustPressed(player, pad, 3) || padJustPressed(player, pad, 7)) ultimate(player);
      }
      if (padPressed(pad, 0)) playerShoot(player);
    });
  }
  function updatePlayer(player, dt) {
    if (!player.active || player.dead) return; const pad = padForPlayer(player.id); const direction = playerDirection(player, pad);
    player.shotCooldown -= dt * 1000; player.invulnerable -= dt * 1000; player.dashCooldown -= dt * 1000; player.specialCooldown -= dt * 1000; player.temporaryBoost -= dt * 1000;
    if (direction.x || direction.y) { player.lastX = direction.x; player.lastY = direction.y; }
    if (player.dashDuration > 0) { player.dashDuration -= dt * 1000; player.vx = player.dashX * 1320; player.vy = player.dashY * 1320; player.x += player.vx * dt; player.y += player.vy * dt; player.trailTimer -= dt * 1000; if (player.trailTimer <= 0) { state.trails.push({ player: player.id, x: player.x, y: player.y, life: 300, maxLife: 300, dashX: player.dashX, dashY: player.dashY }); for (let i = 0; i < 3; i++) state.particles.push({ x: player.x + random(-8, 8), y: player.y + random(-8, 8), vx: -player.dashX * random(180, 360), vy: -player.dashY * random(180, 360), life: 220, maxLife: 220, size: random(2, 5), color: player.color, streak: true }); player.trailTimer = 16; } }
    else { player.vx = direction.x * player.speed; player.vy = direction.y * player.speed; player.x += player.vx * dt; player.y += player.vy * dt; }
    let minX = 24, maxX = innerWidth - 24; if (state.level === 6) { minX = innerWidth * .2; maxX = innerWidth * .8; }
    player.x = clamp(player.x, minX, maxX); player.y = clamp(player.y, playTop(), innerHeight - 29);
  }

  function updateEnemy(enemy, dt) {
    enemy.age += dt * 1000; enemy.shootTimer -= dt * 1000;
    if (['shooter', 'turret', 'miniboss'].includes(enemy.type)) {
      if (enemy.type !== 'turret' && enemy.y < enemy.targetY) enemy.y += enemy.speed * dt;
      else if (enemy.behavior === 'protector') { enemy.guardTarget = state.enemies.find(other => other !== enemy && ['tank', 'miniboss'].includes(other.type)) || null; if (enemy.guardTarget) { const desiredX = enemy.guardTarget.x + Math.sin(state.time / 420 + enemy.phase) * 75; enemy.x += clamp(desiredX - enemy.x, -95 * dt, 95 * dt); enemy.y += clamp(enemy.guardTarget.y + 20 - enemy.y, -70 * dt, 70 * dt); enemy.guardTarget.guarded = 100; } }
      else enemy.x += Math.sin(state.time / 500 + enemy.phase) * (enemy.type === 'miniboss' ? 90 : 55) * dt;
      if (enemy.shootTimer <= 0) fireEnemy(enemy, enemy.type === 'miniboss' ? 'fan' : enemy.pattern);
    } else {
      enemy.y += enemy.speed * dt; enemy.x += enemy.vx * dt;
      if (enemy.behavior === 'zigzag') enemy.x += Math.sin(state.time / 180 + enemy.phase) * 92 * dt;
      if (enemy.behavior === 'chase' && enemy.age < 2200) { const target = targetPlayer(enemy); if (target) enemy.x += clamp(target.x - enemy.x, -105 * dt, 105 * dt); }
      if (enemy.behavior === 'formation') enemy.x += Math.sin(state.time / 430 + enemy.groupId) * 42 * dt;
      if (enemy.behavior === 'flank') enemy.y += Math.sin(state.time / 260 + enemy.phase) * 35 * dt;
      if (enemy.canShoot && enemy.shootTimer <= 0) fireEnemy(enemy, 'direct'); if (enemy.type === 'tank' && state.level >= 5 && enemy.shootTimer <= 0) fireEnemy(enemy);
    }
    enemy.guarded = Math.max(0, (enemy.guarded || 0) - dt * 1000);
    if (enemy.burstLeft > 0) { enemy.burstTimer -= dt * 1000; if (enemy.burstTimer <= 0) { fireEnemy(enemy, 'direct'); enemy.burstLeft--; enemy.burstTimer = 110; } }
    enemy.x = clamp(enemy.x, enemy.w / 2, innerWidth - enemy.w / 2);
  }

  function updateProjectiles(dt) {
    state.bullets.forEach(b => { if (b.missile && b.target && state.enemies.includes(b.target)) { const angle = Math.atan2(b.target.y - b.y, b.target.x - b.x); b.x += Math.cos(angle) * b.speed * dt; b.y += Math.sin(angle) * b.speed * dt; } else { b.x += (b.vx || 0) * dt; b.y -= b.speed * dt; } });
    state.enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; }); state.pickups.forEach(p => p.y += p.speed * dt);
    state.bullets = state.bullets.filter(b => b.y > -50 && b.y < innerHeight + 50 && b.x > -50 && b.x < innerWidth + 50);
    state.enemyBullets = state.enemyBullets.filter(b => b.y > -50 && b.y < innerHeight + 50 && b.x > -50 && b.x < innerWidth + 50); state.pickups = state.pickups.filter(p => p.y < innerHeight + 30);
  }

  function hitBoss(bullet) {
    const b = state.boss; if (!b) return false;
    if (b.type === 'devourer') { if (overlaps(bullet, b)) { b.health -= bullet.damage; sfx('boss_heavy_hit'); return true; } return false; }
    for (const part of b.parts) { if (part.hp <= 0 || part.locked) continue; const target = { x: b.x + part.x * b.w, y: b.y + part.y * b.h, w: part.id === 'núcleo' ? 90 : 115, h: 70 }; if (overlaps(bullet, target)) { part.hp -= bullet.damage; if (part.hp <= 0) { state.score += 1500; gainUlti(state.players[bullet.owner], 30); burst(target.x, target.y, 45, part.color, 320, true); sfx('boss_part_destroy'); } else sfx('boss_heavy_hit'); return true; } }
    return false;
  }

  function resolveCollisions() {
    for (let bi = state.bullets.length - 1; bi >= 0; bi--) {
      const bullet = state.bullets[bi]; if (hitBoss(bullet)) { state.bullets.splice(bi, 1); state.hitFlashes.push({ x: bullet.x, y: bullet.y, life: 85, maxLife: 85, color: bullet.color }); continue; }
      let hit = false; for (let ei = state.enemies.length - 1; ei >= 0; ei--) if (overlaps(bullet, state.enemies[ei])) { const enemy = state.enemies[ei]; enemy.hp -= bullet.damage * (enemy.guarded > 0 ? .62 : 1); state.bullets.splice(bi, 1); burst(bullet.x, bullet.y, 7, bullet.color, 155); state.hitFlashes.push({ x: bullet.x, y: bullet.y, life: 80, maxLife: 80, color: '#ffffff' }); if (enemy.hp <= 0) destroyEnemy(enemy, ei, bullet.owner); else { state.shake = Math.max(state.shake, 1.6); sfx('enemy_hit', { x: enemy.x }); } hit = true; break; } if (hit) continue;
      for (let oi = state.obstacles.length - 1; oi >= 0; oi--) if (state.obstacles[oi].destructible && overlaps(bullet, state.obstacles[oi])) { const rock = state.obstacles[oi]; rock.hp -= bullet.damage; state.bullets.splice(bi, 1); burst(bullet.x, bullet.y, 4, '#9cb1c8', 100); if (rock.hp <= 0) { state.obstacles.splice(oi, 1); state.score += 80; burst(rock.x, rock.y, 22, '#9cb1c8', 230, true); } break; }
    }
    for (let bi = state.enemyBullets.length - 1; bi >= 0; bi--) { const bullet = state.enemyBullets[bi]; let removed = false; for (const p of activePlayers()) if (overlaps(bullet, p)) { state.enemyBullets.splice(bi, 1); if (p.dashDuration > 0) perfectDash(p, bullet); else damagePlayer(p, bullet.damage); removed = true; break; } if (!removed && state.objective && overlaps(bullet, state.objective)) { state.enemyBullets.splice(bi, 1); damageObjective(bullet.damage); } }
    for (let ei = state.enemies.length - 1; ei >= 0; ei--) { const enemy = state.enemies[ei]; let removed = false; for (const p of activePlayers()) if (overlaps(enemy, p)) { state.enemies.splice(ei, 1); damagePlayer(p, enemy.type === 'miniboss' ? 35 : 24); removed = true; break; } if (removed) continue; if (state.objective && overlaps(enemy, state.objective)) { state.enemies.splice(ei, 1); damageObjective(enemy.type === 'tank' ? 30 : 18); continue; } if (enemy.y > innerHeight + enemy.h) { state.enemies.splice(ei, 1); const p = activePlayers()[0]; if (p) damagePlayer(p, 10); } }
    for (const rock of state.obstacles) for (const p of activePlayers()) if (overlaps(rock, p)) damagePlayer(p, 18);
    for (const hazard of state.hazards.filter(h => h.active)) for (const p of activePlayers()) if (overlaps(hazard, p)) damagePlayer(p, hazard.type === 'laser' ? 22 : 16);
    for (let i = state.pickups.length - 1; i >= 0; i--) for (const p of activePlayers()) if (overlaps(state.pickups[i], p)) { if (state.pickups[i].type === 'revive') { const fallen = state.players.find(x => x.active && x.dead); if (fallen) { fallen.dead = false; fallen.health = fallen.maxHealth * .5; fallen.x = p.x + (p.id ? -55 : 55); fallen.y = p.y; fallen.invulnerable = 2200; sfx('player_revive', { player: fallen.id }); } } state.pickups.splice(i, 1); break; }
  }

  function damageObjective(amount) { if (!state.objective) return; state.objective.health = Math.max(0, state.objective.health - amount); if (state.objective.health <= 0) gameOver('La nave aliada fue destruida.'); }

  function updateEnvironment(dt) {
    const level = LEVELS[state.level - 1]; state.environmentTimer -= dt * 1000;
    if (level.asteroids && state.environmentTimer <= 0) { spawnAsteroid(); state.environmentTimer = random(1000, 1800); }
    if (level.storm && state.environmentTimer <= 0) { spawnStormHazard(); state.environmentTimer = state.level === 9 ? 1900 : 2900; }
    state.obstacles.forEach(o => { o.y += o.speed * dt; o.angle += o.spin * dt; }); state.obstacles = state.obstacles.filter(o => o.y < innerHeight + o.h);
    state.hazards.forEach(h => { h.timer -= dt * 1000; if (!h.active && h.timer <= 0) { h.active = true; h.timer = h.duration; } else if (h.active && h.timer <= 0) { h.active = false; h.done = !h.permanent; h.timer = h.permanent ? 1800 : 0; } }); state.hazards = state.hazards.filter(h => !h.done);
  }

  function updateAmbient(dt) { state.stars.forEach(s => { s.y += s.speed * dt; if (s.y > innerHeight) { s.y = -2; s.x = random(0, innerWidth); } }); state.particles.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; p.life -= dt * 1000; if (p.ring) p.size += dt * 105; }); state.trails.forEach(t => t.life -= dt * 1000); state.hitFlashes.forEach(f => f.life -= dt * 1000); state.particles = state.particles.filter(p => p.life > 0); state.trails = state.trails.filter(t => t.life > 0); state.hitFlashes = state.hitFlashes.filter(f => f.life > 0); state.flash -= dt * 1000; state.phaseFlash -= dt * 1000; state.shake *= .86; state.comboTimer -= dt * 1000; state.toastTimer -= dt * 1000; if (state.toastTimer <= 0) ui.toast.classList.remove('visible'); if (state.comboTimer <= 0) state.combo = 0; ui.combo.classList.toggle('visible', state.combo >= 2); ui.comboValue.textContent = `×${state.combo}`; }

  function update(dt) {
    updatePadDisplay(); pollP2Calibration(); updateAmbient(dt); if (state.mode === 'paused' || state.mode === 'menu' || ['gameover', 'victory', 'upgrade'].includes(state.mode)) return;
    if (state.mode === 'intro') { state.levelTimer -= dt * 1000; if (state.levelTimer <= 0) enterLevel(); return; }
    if (state.mode === 'levelclear') { state.levelTimer -= dt * 1000; if (state.levelTimer <= 0) advanceAfterClear(); return; }
    if (state.mode !== 'playing') return; updateInputs(); state.time += dt * 1000; state.players.forEach(p => updatePlayer(p, dt)); separatePlayers(); updateCoop(dt);
    if (state.keys.has(' ')) playerShoot(state.players[0]);
    state.spawnTimer -= dt * 1000; const cap = (5 + Math.floor(state.level / 2)) * (state.playerCount === 2 ? 1.35 : 1);
    if (state.queue.length && state.spawnTimer <= 0 && state.enemies.length < cap) { spawnEnemy(); state.spawnTimer = Math.max(260, 760 - state.level * 35); }
    state.enemies.forEach(e => updateEnemy(e, dt)); updateProjectiles(dt); updateEnvironment(dt); updateBoss(dt); resolveCollisions();
    if (state.boss) { const dead = state.boss.type === 'devourer' ? state.boss.health <= 0 : state.boss.parts.every(p => p.hp <= 0); if (dead) { const b = state.boss, finale = state.level === 10, explosions = finale ? 28 : 17; if (state.level === 5) state.boss5Defeated = true; if (finale) state.finalBossDefeated = true; submitRecord(false); state.phaseFlash = finale ? 1400 : 800; state.shake = finale ? 24 : 15; sfx('boss_defeat'); for (let i = 0; i < explosions; i++) setTimeout(() => { burst(b.x + random(-b.w / 2, b.w / 2), b.y + random(-b.h / 2, b.h / 2), finale ? 34 : 26, i % 3 ? '#ff426f' : '#42f5e9', finale ? 440 : 350, true); sfx('enemy_destroy', { x: b.x }); }, i * (finale ? 75 : 68)); state.score += finale ? 12000 : 5000; state.players.forEach(p => { gainUlti(p, 100); p.health = Math.min(p.maxHealth, p.health + 35); sfx('player_heal', { player: p.id }); }); state.boss = null; ui.bossHud.classList.remove('visible'); completeLevel(); } }
    else if (!state.queue.length && !state.enemies.length && (!LEVELS[state.level - 1].asteroids || state.time > 12000)) completeLevel(); updateHud();
  }

  function updateHud() {
    ui.score.textContent = String(Math.floor(state.score)).padStart(6, '0'); ui.level.textContent = state.level || '—'; ui.levelName.textContent = state.level ? LEVELS[state.level - 1].name : 'EN ESPERA';
    state.players.forEach((p, i) => { const n = i + 1; $(`#p${n}HealthBar`).style.width = `${clamp(p.health / p.maxHealth, 0, 1) * 100}%`; $(`#p${n}HealthValue`).textContent = Math.ceil(p.health); $(`#p${n}UltiBar`).style.width = `${p.ulti}%`; $(`#p${n}UltiValue`).textContent = p.ulti >= 100 ? 'LISTA' : `${Math.floor(p.ulti)}%`; const dash = 1 - clamp(p.dashCooldown / p.dashBase, 0, 1); $(`#p${n}DashBar`).style.width = `${dash * 100}%`; $(`#p${n}DashValue`).textContent = dash >= 1 ? 'LISTO' : `${(p.dashCooldown / 1000).toFixed(1)}s`; $(`#p${n}State`).textContent = p.dead ? (p.reviveProgress > 0 ? `REVIVIENDO ${Math.floor(p.reviveProgress / 18)}%` : 'CAÍDO') : state.synergy ? 'ENLAZADO' : p.shield ? `ESCUDO ${p.shield}` : 'ACTIVO'; });
    if (state.boss) { ui.bossPhase.textContent = `FASE ${state.boss.phase}`; const ratio = state.boss.type === 'devourer' ? state.boss.health / state.boss.maxHealth : state.boss.health / state.boss.maxHealth; ui.bossBar.style.width = `${clamp(ratio, 0, 1) * 100}%`; }
    if (state.objective) ui.objectiveBar.style.width = `${state.objective.health / state.objective.maxHealth * 100}%`; document.querySelector('.touch-ulti')?.classList.toggle('ready', state.players[0].ulti >= 100);
  }

  function drawBackground() {
    const corridor = state.level === 6, defense = state.level === 7; ctx.clearRect(0, 0, innerWidth, innerHeight);
    const glow = ctx.createRadialGradient(innerWidth / 2, innerHeight * .58, 0, innerWidth / 2, innerHeight * .58, Math.max(innerWidth, innerHeight) * .75); glow.addColorStop(0, corridor ? '#233026' : defense ? '#102f39' : '#11244d'); glow.addColorStop(.46, corridor ? '#111715' : '#080f29'); glow.addColorStop(1, '#02040b'); ctx.fillStyle = glow; ctx.fillRect(0, 0, innerWidth, innerHeight);
    state.stars.forEach(s => { ctx.globalAlpha = s.alpha; ctx.fillStyle = corridor ? '#8dffba' : '#b9d8ff'; ctx.fillRect(s.x, s.y, s.size, s.size * 2.2); }); ctx.globalAlpha = 1;
    const horizon = innerHeight * .7; for (let x = -innerWidth; x < innerWidth * 2; x += 90) { ctx.beginPath(); ctx.moveTo(innerWidth / 2, horizon); ctx.lineTo(x, innerHeight); ctx.strokeStyle = 'rgba(54,94,190,.07)'; ctx.stroke(); }
    if (corridor) { ctx.fillStyle = 'rgba(11,18,20,.94)'; ctx.fillRect(0, 0, innerWidth * .18, innerHeight); ctx.fillRect(innerWidth * .82, 0, innerWidth * .18, innerHeight); ctx.strokeStyle = '#315d55'; ctx.strokeRect(innerWidth * .18, 0, innerWidth * .64, innerHeight); }
  }

  function drawShip(player, x = player.x, y = player.y, alpha = 1) { ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha; const engine = ctx.createLinearGradient(0, 18, 0, 55); engine.addColorStop(0, '#fff'); engine.addColorStop(.2, player.color); engine.addColorStop(1, 'transparent'); ctx.fillStyle = engine; ctx.beginPath(); ctx.moveTo(-8, 18); ctx.lineTo(0, 54 + random(0, 8)); ctx.lineTo(8, 18); ctx.fill(); ctx.shadowBlur = 18; ctx.shadowColor = player.color; ctx.fillStyle = '#eaffff'; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(18, 20); ctx.lineTo(5, 13); ctx.lineTo(0, 23); ctx.lineTo(-5, 13); ctx.lineTo(-18, 20); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = player.accent; ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(7, 10); ctx.lineTo(0, 5); ctx.lineTo(-7, 10); ctx.closePath(); ctx.fill(); ctx.fillStyle = player.color; ctx.fillRect(-18, 13, 6, 5); ctx.fillRect(12, 13, 6, 5); ctx.restore(); }
  function drawPlayers() {
    if (state.synergy) { const [a, b] = state.players; ctx.save(); ctx.strokeStyle = 'rgba(190,125,255,.34)'; ctx.lineWidth = 2; ctx.setLineDash([5, 9]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore(); }
    state.trails.forEach(t => { drawShip(state.players[t.player], t.x, t.y, t.life / t.maxLife * .38); ctx.save(); ctx.globalAlpha = t.life / t.maxLife * .45; ctx.strokeStyle = state.players[t.player].color; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x - (t.dashX || 0) * 48, t.y - (t.dashY || 0) * 48); ctx.stroke(); ctx.restore(); });
    state.players.forEach(p => { if (!p.active) return; if (p.dead) { ctx.save(); ctx.strokeStyle = p.color; ctx.globalAlpha = .55 + Math.sin(state.time / 120) * .25; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 24 + p.reviveProgress / 120, 0, 6.28); ctx.stroke(); ctx.fillStyle = p.color; ctx.font = '900 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('CAÍDO', p.x, p.y + 4); ctx.restore(); return; } if (p.invulnerable > 0 && p.dashDuration <= 0 && Math.floor(p.invulnerable / 70) % 2) return; drawShip(p); });
  }

  function drawEnemy(e) { ctx.save(); ctx.translate(e.x, e.y); ctx.shadowBlur = 16; ctx.shadowColor = e.color; ctx.fillStyle = e.color; if (e.type === 'fast') { ctx.rotate(Math.sin(state.time / 130 + e.phase) * .14); ctx.beginPath(); ctx.moveTo(0, e.h / 2); ctx.lineTo(e.w / 2, -e.h / 2); ctx.lineTo(0, -e.h * .18); ctx.lineTo(-e.w / 2, -e.h / 2); ctx.closePath(); ctx.fill(); } else if (['tank', 'miniboss'].includes(e.type)) { ctx.beginPath(); ctx.moveTo(0, e.h / 2); ctx.lineTo(e.w / 2, e.h * .08); ctx.lineTo(e.w * .34, -e.h / 2); ctx.lineTo(0, -e.h * .3); ctx.lineTo(-e.w * .34, -e.h / 2); ctx.lineTo(-e.w / 2, e.h * .08); ctx.closePath(); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(0, e.h / 2); ctx.lineTo(e.w / 2, -e.h / 3); ctx.lineTo(e.w * .25, -e.h / 2); ctx.lineTo(0, -e.h * .28); ctx.lineTo(-e.w * .25, -e.h / 2); ctx.lineTo(-e.w / 2, -e.h / 3); ctx.closePath(); ctx.fill(); } ctx.shadowBlur = 0; ctx.fillStyle = '#42142b'; ctx.fillRect(-e.w * .12, -e.h * .16, e.w * .24, e.h * .35); if (e.guarded > 0) { ctx.strokeStyle = '#ffcf70'; ctx.globalAlpha = .7; ctx.beginPath(); ctx.arc(0, 0, e.w * .65, 0, 6.28); ctx.stroke(); ctx.globalAlpha = 1; } if (e.hp < e.maxHp) { ctx.fillStyle = '#172039'; ctx.fillRect(-e.w / 2, -e.h / 2 - 8, e.w, 3); ctx.fillStyle = e.color; ctx.fillRect(-e.w / 2, -e.h / 2 - 8, e.w * clamp(e.hp / e.maxHp, 0, 1), 3); } ctx.restore(); }
  function drawAsteroid(o) { ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.angle); ctx.fillStyle = '#53657a'; ctx.strokeStyle = '#9cb1c8'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, r = o.w * random(.38, .52); i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  function drawHazard(h) { ctx.save(); const warning = !h.active; ctx.globalAlpha = warning ? .24 + Math.sin(state.time / 80) * .12 : .72; ctx.strokeStyle = warning ? '#ffd166' : '#66e9ff'; ctx.fillStyle = h.active ? 'rgba(70,220,255,.24)' : 'rgba(255,209,102,.08)'; ctx.lineWidth = h.active ? 4 : 2; if (h.type === 'area') { ctx.beginPath(); ctx.arc(h.x, h.y, h.w / 2, 0, 6.28); ctx.fill(); ctx.stroke(); } else { ctx.fillRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h); ctx.strokeRect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h); if (h.active) for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(h.x - h.w / 2, h.y - h.h / 2 + random(0, h.h)); ctx.lineTo(h.x + h.w / 2, h.y - h.h / 2 + random(0, h.h)); ctx.stroke(); } } ctx.restore(); }

  function drawBoss() {
    const b = state.boss; if (!b) return; const ratio = clamp(b.health / b.maxHealth, 0, 1); ctx.save(); ctx.translate(b.x, b.y);
    ctx.globalAlpha = .12 + (1 - ratio) * .15; ctx.fillStyle = b.phase === 3 ? '#42f5e9' : '#ff426f'; ctx.beginPath(); ctx.arc(0, 0, b.w * (.48 + Math.sin(state.time / 160) * .018), 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
    ctx.shadowBlur = 28 + b.phase * 6; ctx.shadowColor = b.phase === 3 ? '#42f5e9' : '#ff426f'; ctx.fillStyle = ratio < .34 ? '#65233f' : '#8d2146';
    ctx.beginPath(); ctx.moveTo(0, b.h / 2); ctx.lineTo(b.w / 2, 0); ctx.lineTo(b.w * .36, -b.h / 2); ctx.lineTo(0, -b.h * .32); ctx.lineTo(-b.w * .36, -b.h / 2); ctx.lineTo(-b.w / 2, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#151b38'; ctx.fillRect(-b.w * .22, -b.h * .14, b.w * .44, b.h * .35);
    if (ratio < .66) { ctx.strokeStyle = ratio < .34 ? '#ff9d42' : '#ff688d'; ctx.lineWidth = 2; for (let i = 0; i < (ratio < .34 ? 7 : 4); i++) { const x = -b.w * .3 + i * b.w * .1; ctx.beginPath(); ctx.moveTo(x, -b.h * .24); ctx.lineTo(x + 18, -2); ctx.lineTo(x + 5, 25); ctx.stroke(); } }
    if (b.type === 'devourer') { ctx.fillStyle = b.phase === 3 ? '#bafffb' : '#ff426f'; ctx.shadowBlur = 24; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(0, 15, 34 + b.phase * 5 + Math.sin(state.time / 120) * 7, 0, 6.28); ctx.fill(); }
    else b.parts.forEach(part => { const px = part.x * b.w, py = part.y * b.h; if (part.hp <= 0) { ctx.strokeStyle = '#ff7b54'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 28, py - 18); ctx.lineTo(px + 28, py + 18); ctx.moveTo(px + 28, py - 18); ctx.lineTo(px - 28, py + 18); ctx.stroke(); return; } ctx.fillStyle = part.locked ? '#33415b' : part.color; ctx.shadowBlur = part.locked ? 0 : 18; ctx.shadowColor = part.color; ctx.fillRect(px - 38, py - 24, 76, 48); });
    ctx.restore(); if (b.copies) b.copies.forEach(c => { ctx.save(); ctx.globalAlpha = .76 + Math.sin(state.time / 90) * .2; ctx.shadowBlur = 18; ctx.shadowColor = '#ff62a0'; ctx.fillStyle = '#ff62a0'; ctx.fillRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h); ctx.restore(); });
  }
  function drawObjective() { if (!state.objective) return; const o = state.objective; ctx.save(); ctx.translate(o.x, o.y); ctx.shadowBlur = 24; ctx.shadowColor = '#79ffb1'; ctx.strokeStyle = '#79ffb1'; ctx.fillStyle = 'rgba(121,255,177,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 36, 0, 6.28); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#dffff0'; ctx.fillRect(-12, -12, 24, 24); ctx.restore(); }

  function draw() {
    drawBackground(); ctx.save(); if (state.shake > .3) ctx.translate(random(-state.shake, state.shake), random(-state.shake, state.shake));
    state.hazards.forEach(drawHazard); state.obstacles.forEach(drawAsteroid); drawObjective();
    state.pickups.forEach(p => { ctx.shadowBlur = 15; ctx.shadowColor = '#79ffb1'; ctx.fillStyle = '#79ffb1'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 6.28); ctx.fill(); ctx.fillStyle = '#082117'; ctx.fillRect(p.x - 2, p.y - 7, 4, 14); ctx.fillRect(p.x - 7, p.y - 2, 14, 4); });
    state.bullets.forEach(b => { ctx.shadowBlur = 12; ctx.shadowColor = b.color; ctx.fillStyle = b.color; ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); });
    state.enemyBullets.forEach(b => { ctx.shadowBlur = 14; ctx.shadowColor = b.color; ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, b.w / 2, 0, 6.28); ctx.fill(); });
    ctx.shadowBlur = 0; state.enemies.forEach(drawEnemy); drawBoss(); drawPlayers();
    state.particles.forEach(p => { ctx.globalAlpha = p.life / p.maxLife; ctx.strokeStyle = p.color; ctx.fillStyle = p.color; if (p.ring) { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.28); ctx.stroke(); } else if (p.streak) { ctx.lineWidth = Math.max(1, p.size * .6); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .045, p.y - p.vy * .045); ctx.stroke(); } else ctx.fillRect(p.x, p.y, p.size, p.size); });
    state.hitFlashes.forEach(f => { ctx.globalAlpha = f.life / f.maxLife; ctx.fillStyle = f.color; ctx.shadowBlur = 22; ctx.shadowColor = f.color; ctx.beginPath(); ctx.arc(f.x, f.y, 5 + (1 - f.life / f.maxLife) * 12, 0, 6.28); ctx.fill(); });
    ctx.globalAlpha = 1; ctx.restore();
    if (state.flash > 0) { ctx.fillStyle = `rgba(180,110,255,${clamp(state.flash / 600, 0, 1) * .18})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
    if (state.phaseFlash > 0) { ctx.fillStyle = `rgba(255,66,111,${clamp(state.phaseFlash / 700, 0, 1) * .3})`; ctx.fillRect(0, 0, innerWidth, innerHeight); }
  }

  function loop(timestamp) { const dt = Math.min((timestamp - state.lastTime) / 1000 || 0, .033); state.lastTime = timestamp; update(dt); draw(); requestAnimationFrame(loop); }

  addEventListener('resize', resize); addEventListener('gamepadconnected', updatePadDisplay); addEventListener('gamepaddisconnected', updatePadDisplay);
  function syncAudioControls() { ui.musicVolume.value = Math.round(audio.settings.music * 100); ui.sfxVolume.value = Math.round(audio.settings.sfx * 100); ui.muteButton.textContent = audio.settings.muted ? 'SONIDO: SILENCIADO' : 'SONIDO: ACTIVO'; ui.muteButton.setAttribute('aria-pressed', String(audio.settings.muted)); }
  addEventListener('pointerdown', () => { initAudio(); if (state.mode === 'menu') setMusic('menu'); }, { once: true });
  addEventListener('keydown', event => { initAudio(); const key = event.key.toLowerCase(); if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'shift', 'w', 'a', 's', 'd'].includes(key)) event.preventDefault(); state.keys.add(key); const p = state.players[0]; if (key === 'shift' && !event.repeat) dash(p); if (key === 'e' && !event.repeat) special(p); if (key === 'q' && !event.repeat) ultimate(p); if ((key === 'p' || key === 'escape') && !event.repeat) togglePause(); });
  addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase())); addEventListener('blur', () => state.keys.clear());
  $('#onePlayerButton').addEventListener('click', () => { initAudio(); startCampaign(1); }); $('#twoPlayerButton').addEventListener('click', () => { initAudio(); startCampaign(2); });
  $('#controlsButton').addEventListener('click', () => { sfx('ui_confirm'); showScreen(ui.controls); }); $('#closeControlsButton').addEventListener('click', () => { sfx('ui_cancel'); showScreen(ui.start); });
  $('#calibrateP2Button').addEventListener('click', startP2Calibration);
  $('#restartButton').addEventListener('click', returnToMenu); $('#victoryMenuButton').addEventListener('click', returnToMenu);
  ui.upgradeChoices.addEventListener('click', event => { const button = event.target.closest('[data-upgrade]'); if (button) chooseUpgrade(button.dataset.upgrade); });
  document.querySelectorAll('button').forEach(button => button.addEventListener('pointerenter', () => sfx('ui_move')));
  ui.musicVolume.addEventListener('input', () => audio.setMusicVolume(Number(ui.musicVolume.value) / 100));
  ui.sfxVolume.addEventListener('input', () => audio.setSfxVolume(Number(ui.sfxVolume.value) / 100));
  ui.muteButton.addEventListener('click', () => { initAudio(); audio.toggleMute(); syncAudioControls(); sfx('ui_confirm'); });
  addEventListener('void-toggle-pause', togglePause);
  addEventListener('void-restart-level', () => { if (state.mode !== 'paused') return; audio.resumeMusic(); showScreen(null); startLevel(state.level); });
  addEventListener('void-return-menu', returnToMenu);
  addEventListener('void-show-game-screen', event => { const screen = ui[event.detail]; if (screen) showScreen(screen); });

  window.__voidRunnerTest = {
    start: startCampaign, level(number) { showScreen(null); startLevel(clamp(number, 1, 10)); }, enter: enterLevel,
    clear() { state.queue = []; state.enemies = []; state.obstacles = []; }, spawn: spawnEnemy, dash: id => dash(state.players[id || 0]),
    special: id => special(state.players[id || 0]), ulti(id = 0) { state.players[id].ulti = 100; return ultimate(state.players[id]); },
    damage(id = 0, amount = 10) { return damagePlayer(state.players[id], amount); }, charge(id = 0) { state.players[id].ulti = 100; },
    damageObjective(amount = 10) { damageObjective(amount); },
    nearMiss(id = 0) { const p = state.players[id]; state.enemyBullets.push({ x: p.x, y: p.y, w: 9, h: 9, vx: 0, vy: 0, damage: 10, color: '#ffd166' }); },
    bossRatio(ratio) { if (!state.boss) return; if (state.boss.type === 'devourer') state.boss.health = state.boss.maxHealth * ratio; },
    destroyPart(id) { const part = state.boss?.parts?.find(p => p.id === id); if (part) part.hp = 0; },
    killBoss() { if (!state.boss) return; if (state.boss.type === 'devourer') state.boss.health = 0; else state.boss.parts.forEach(p => p.hp = 0); },
    choose: chooseUpgrade, pads: updatePadDisplay, audio: () => audio.debug(), audioEvent: (name, options) => { initAudio(); return sfx(name, options); }, music: (theme, section = 1) => { initAudio(); return setMusic(theme, section); }, gameOver, victory, mode: () => state.mode,
    snapshot: () => ({ mode: state.mode, level: state.level, clock: Math.round(state.time), gamepads: state.gamepads.length, synergy: state.synergy, toast: ui.toast.classList.contains('visible'), particles: state.particles.length, players: state.players.filter(p => p.active).map(p => ({ id: p.id, dead: p.dead, health: p.health, ulti: p.ulti, dash: Math.max(0, p.dashCooldown), x: Math.round(p.x), y: Math.round(p.y), boost: Math.max(0, p.temporaryBoost), revive: p.reviveProgress })), queue: state.queue.length, queueTypes: [...new Set(state.queue)], enemies: state.enemies.map(e => ({ type: e.type, behavior: e.behavior, guarded: e.guarded > 0 })), bullets: state.bullets.length, bulletOwners: [...new Set(state.bullets.map(b => b.owner))], enemyBullets: state.enemyBullets.length, hazards: state.hazards.map(h => ({ type: h.type, active: h.active })), obstacles: state.obstacles.length, boss: state.boss ? { type: state.boss.type, phase: state.boss.phase, health: state.boss.health, copies: state.boss.copies?.length || 0, parts: state.boss.parts?.map(p => ({ id: p.id, hp: p.hp, locked: p.locked })) } : null, objective: state.objective?.health || null })
  };

  syncAudioControls(); resize(); updatePadDisplay(); updateHud(); requestAnimationFrame(loop);
})();
