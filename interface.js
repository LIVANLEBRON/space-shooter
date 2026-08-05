(() => {
  'use strict';
  const $ = selector => document.querySelector(selector), screens = () => [...document.querySelectorAll('.screen')];
  const PREF_KEY = 'void-runner-touch-mode', NAME_KEY = 'void-runner-pilot-name';
  let focused = 0, currentScreen = null, repeatAt = 0, heldDirection = 0, actionLock = 0, confirmAction = null, toastTimer = 0;
  const padState = new Map();
  const activeScreen = () => screens().find(screen => screen.classList.contains('visible')) || null;
  const focusables = screen => screen ? [...screen.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled])')].filter(el => el.offsetParent !== null) : [];
  function focusAt(index = 0) {
    const list = focusables(activeScreen()); if (!list.length) return; focused = (index + list.length) % list.length;
    document.querySelectorAll('.gamepad-focus').forEach(el => el.classList.remove('gamepad-focus')); const element = list[focused]; element.classList.add('gamepad-focus'); element.focus({ preventScroll: true }); element.scrollIntoView({ block: 'nearest' });
  }
  function screenChanged() { currentScreen = activeScreen(); focused = 0; heldDirection = 0; repeatAt = performance.now() + 300; applyTouchMode(); requestAnimationFrame(() => focusAt(0)); }
  function show(key) { dispatchEvent(new CustomEvent('void-show-game-screen', { detail: key })); }
  function back() {
    const id = activeScreen()?.id;
    if (id === 'controlsScreen' || id === 'optionsScreen' || id === 'rankingScreen') { saveOptions(); show('start'); }
    else if (id === 'pauseScreen') dispatchEvent(new Event('void-toggle-pause'));
    else if (id === 'confirmScreen') { confirmAction = null; show('pause'); }
    else if (id === 'gameOverScreen' || id === 'victoryScreen') dispatchEvent(new Event('void-return-menu'));
  }
  function confirmDialog(action, title, text) { confirmAction = action; $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; show('confirm'); }
  function activate() { const element = focusables(activeScreen())[focused]; if (!element) return; element.click(); }
  function navigate(direction) { if (activeScreen()?.id === 'rankingScreen') { $('.ranking-panel').scrollBy({ top: direction * 120, behavior: 'smooth' }); window.VoidAudio?.play('ui_move'); return; } const element = focusables(activeScreen())[focused]; if (element?.tagName === 'SELECT' && Math.abs(direction) === 1) { element.selectedIndex = (element.selectedIndex + direction + element.options.length) % element.options.length; element.dispatchEvent(new Event('change')); return; } focusAt(focused + direction); window.VoidAudio?.play('ui_move'); }
  function pressed(pad, button) { return Boolean(pad?.buttons?.[button]?.pressed); }
  function pollPads(now) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [], visible = activeScreen();
    let direction = 0, a = false, b = false, start = false;
    for (const pad of pads) { const y = pad.axes?.[1] || 0; direction ||= pressed(pad, 13) || y > .55 ? 1 : pressed(pad, 12) || y < -.55 ? -1 : 0; a ||= pressed(pad, 0); b ||= pressed(pad, 1); start ||= pressed(pad, 9); }
    const prior = padState.get('combined') || { a: false, b: false, start: false };
    if (start && !prior.start && now > actionLock) { actionLock = now + 220; const mode = window.__voidRunnerTest?.mode(); if (mode === 'playing' || mode === 'intro' || mode === 'paused') dispatchEvent(new Event('void-toggle-pause')); }
    if (visible && a && !prior.a && now > actionLock) { actionLock = now + 180; activate(); }
    if (visible && b && !prior.b && now > actionLock) { actionLock = now + 180; back(); }
    if (visible && direction) { if (direction !== heldDirection || now >= repeatAt) { navigate(direction); repeatAt = now + (direction === heldDirection ? 125 : 330); } heldDirection = direction; } else heldDirection = 0;
    padState.set('combined', { a, b, start });
  }
  function cleanName() { const input = $('#pilotName'), value = window.VoidRanking.safeName(input.value); input.value = value; localStorage.setItem(NAME_KEY, value); return value; }
  function saveOptions() { cleanName(); localStorage.setItem(PREF_KEY, $('#touchMode').value); applyTouchMode(); }
  function applyTouchMode() { const mode = localStorage.getItem(PREF_KEY) || 'auto', touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0, allowed = !activeScreen(); $('#touchControls').classList.toggle('visible', allowed && (mode === 'on' || (mode === 'auto' && touch))); }
  function toast(message) { const node = $('#networkToast'); node.textContent = message; node.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 2600); }
  function rankRow(record, index, compact = false) { const li = document.createElement('li'); if (record.finalBossDefeated) li.className = 'champion'; const values = compact ? [String(index + 1), `${record.finalBossDefeated ? '★ ' : ''}${record.name}`, `N${record.highestLevel}`, String(record.maxScore).padStart(6, '0')] : [String(index + 1), `${record.finalBossDefeated ? '★ ' : ''}${record.name}`, String(record.highestLevel), String(record.maxScore).padStart(6, '0'), record.playerCount === 2 ? 'COOP' : 'INDIVIDUAL']; values.forEach((value, i) => { const span = document.createElement('span'); span.textContent = value; if (compact && i === 3) span.className = 'pilot-score'; li.append(span); }); return li; }
  async function refreshRanking() { try { const records = await window.VoidRanking.top(50); $('#topPilotsList').replaceChildren(...records.slice(0, 7).map((r, i) => rankRow(r, i, true))); $('#rankingList').replaceChildren(...records.map((r, i) => rankRow(r, i))); } catch (_) { for (const id of ['topPilotsList', 'rankingList']) { const li = document.createElement('li'); li.className = 'empty-rank'; li.textContent = 'Ranking no disponible'; $(`#${id}`).replaceChildren(li); } toast('Ranking no disponible'); } }
  function bindTouch() { document.querySelectorAll('#touchControls [data-key]').forEach(button => { const key = button.dataset.key, down = event => { event.preventDefault(); dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }, up = event => { event.preventDefault(); dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); }; button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('pointerleave', up); }); }
  $('#optionsButton').addEventListener('click', () => show('options')); $('#rankingButton').addEventListener('click', () => { show('ranking'); refreshRanking(); });
  $('#closeOptionsButton').addEventListener('click', () => { saveOptions(); show('start'); }); $('#closeRankingButton').addEventListener('click', () => show('start'));
  $('#continueButton').addEventListener('click', () => dispatchEvent(new Event('void-toggle-pause')));
  $('#pauseRestartButton').addEventListener('click', () => confirmDialog('restart', '¿REINICIAR NIVEL?', 'Se reiniciará el nivel actual.'));
  $('#pauseMenuButton').addEventListener('click', () => confirmDialog('menu', '¿VOLVER AL MENÚ?', 'El progreso de esta partida terminará.'));
  $('#confirmNoButton').addEventListener('click', () => { confirmAction = null; show('pause'); }); $('#confirmYesButton').addEventListener('click', () => { const action = confirmAction; confirmAction = null; dispatchEvent(new Event(action === 'restart' ? 'void-restart-level' : 'void-return-menu')); });
  $('#pilotName').addEventListener('change', cleanName); $('#touchMode').addEventListener('change', () => { localStorage.setItem(PREF_KEY, $('#touchMode').value); applyTouchMode(); });
  $('#touchPauseButton').addEventListener('click', () => dispatchEvent(new Event('void-toggle-pause')));
  addEventListener('void-screen-change', screenChanged); addEventListener('void-ranking-updated', refreshRanking); addEventListener('gamepadconnected', screenChanged); addEventListener('online', () => window.VoidRanking.sync());
  window.VoidRanking.onStatus(toast);
  addEventListener('keydown', event => { if (!activeScreen()) return; if (event.key === 'ArrowDown') { event.preventDefault(); navigate(1); } else if (event.key === 'ArrowUp') { event.preventDefault(); navigate(-1); } else if (event.key === 'Escape') { event.preventDefault(); back(); } });
  $('#pilotName').value = localStorage.getItem(NAME_KEY) || 'Piloto anónimo'; $('#touchMode').value = localStorage.getItem(PREF_KEY) || 'auto'; applyTouchMode(); bindTouch(); refreshRanking(); screenChanged();
  const loop = now => { pollPads(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  window.__voidInterfaceTest = { focus: () => document.activeElement?.id || document.activeElement?.dataset?.upgrade || '', screen: () => activeScreen()?.id || '', navigate, activate, back, refreshRanking, applyTouchMode, show, toast };
})();
