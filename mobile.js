(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const STORAGE_KEY = 'spaceShooter.mobileControls';
  const PILOT_KEYS = ['spaceShooter.player1Name', 'spaceShooter.player2Name', 'spaceShooter.player3Name'];
  const DEFAULT_NAMES = ['Piloto 1', 'Piloto 2', 'Piloto 3'];
  const CONFIG = Object.freeze({
    defaults: { orientation: 'auto', movement: 'tilt', sensitivity: 'medium', deadzone: 'medium', invertY: 'no', touchMode: 'auto', buttonSize: 'small', opacity: '45' },
    sensitivity: { low: .65, medium: 1, high: 1.35 }, deadzone: { small: 2.5, medium: 4, large: 6 }, smoothing: .16, tiltLimit: 22, sensorTimeout: 2200
  });
  const capabilities = { touch: navigator.maxTouchPoints > 0, coarse: matchMedia('(pointer: coarse)').matches, orientation: 'DeviceOrientationEvent' in window, fullscreen: Boolean(document.documentElement.requestFullscreen) };
  const capable = capabilities.touch || capabilities.coarse;
  let settings = loadSettings(), names = loadNames(), sensorPermission = 'idle', sensorListening = false, sensorValidAt = 0, sensorStartedAt = 0, lastSensorEvent = 0, center = null, filtered = { x: 0, y: 0 }, joystick = { x: 0, y: 0, pointer: null }, fallbackNotified = false, lastPhysicalOrientation = null;

  function loadSettings() { try { const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)); return { ...CONFIG.defaults, ...(stored || {}), ...(!stored && localStorage.getItem('void-runner-touch-mode') ? { touchMode: localStorage.getItem('void-runner-touch-mode') } : {}) }; } catch (_) { return { ...CONFIG.defaults }; } }
  function saveSettings() { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
  function sanitizeName(value, fallback) { return String(value || '').replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) || fallback; }
  function loadNames() {
    const legacy = localStorage.getItem('void-runner-pilot-name');
    return PILOT_KEYS.map((key, index) => { const existing = localStorage.getItem(key), value = sanitizeName(existing || (index === 0 ? legacy : '') || DEFAULT_NAMES[index], DEFAULT_NAMES[index]); localStorage.setItem(key, value); return value; });
  }
  function saveNames() { names = PILOT_KEYS.map((key, index) => { const value = sanitizeName($(`#pilotName${index + 1}`).value, DEFAULT_NAMES[index]); localStorage.setItem(key, value); return value; }); localStorage.setItem('void-runner-pilot-name', names[0]); updatePilotCards(); dispatchEvent(new CustomEvent('void-pilot-names', { detail: { names: [...names] } })); }
  function updatePilotCards() { names.forEach((name, index) => { $(`#pilotName${index + 1}`).value = name; $(`#pilotCardName${index + 1}`).textContent = name; }); updateDevices(); }
  function updateDevices() { const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [], coop = document.querySelector('.pilot-profile[data-pilot="2"]')?.classList.contains('selected'); $('#pilotCardStatus1').textContent = pads.length >= 2 || (pads.length === 1 && !coop) ? 'ACTIVO · MANDO 1' : 'ACTIVO · TECLADO'; $('#pilotCardStatus2').textContent = coop ? (pads.length ? `ACTIVO · MANDO ${pads.length >= 2 ? 2 : 1}` : 'ACTIVO · SIN MANDO') : (pads.length ? `DISPONIBLE · MANDO ${pads.length >= 2 ? 2 : 1}` : 'DISPONIBLE · SIN MANDO'); }
  function toast(message) { window.__voidInterfaceTest?.toast(message); }
  function physicalOrientation() { return innerWidth >= innerHeight ? 'landscape' : 'portrait'; }
  function updateOrientation() { if (!capable) return; const physical = physicalOrientation(), changed = lastPhysicalOrientation && lastPhysicalOrientation !== physical, layout = settings.orientation === 'auto' ? physical : settings.orientation; lastPhysicalOrientation = physical; document.body.classList.toggle('mobile-landscape', layout === 'landscape'); document.body.classList.toggle('mobile-portrait', layout === 'portrait'); if (changed && sensorPermission === 'granted') { center = null; filtered = { x: 0, y: 0 }; } }
  function selectedGameVisible() { return capable && !document.querySelector('.screen.visible') && ['playing', 'intro'].includes(window.__voidRunnerTest?.mode?.()); }
  function touchWanted() { return settings.touchMode === 'on' || (settings.touchMode === 'auto' && (capabilities.touch || capabilities.coarse)); }
  function applySettings() {
    document.body.classList.toggle('mobile-capable', capable); document.body.dataset.mobileMovement = settings.movement; document.body.dataset.mobileButtons = settings.buttonSize; document.documentElement.style.setProperty('--touch-opacity', String(Number(settings.opacity) / 100));
    for (const [id, key] of [['mobileOrientation', 'orientation'], ['mobileMovement', 'movement'], ['mobileSensitivity', 'sensitivity'], ['mobileDeadzone', 'deadzone'], ['mobileInvertY', 'invertY'], ['touchMode', 'touchMode'], ['mobileButtonSize', 'buttonSize'], ['mobileOpacity', 'opacity']]) $(`#${id}`).value = settings[key];
    $('#mobileSettings').hidden = !capable; $('#touchControls').classList.toggle('visible', capable && selectedGameVisible() && touchWanted()); $('#touchJoystick').hidden = settings.movement !== 'joystick';
    if (settings.movement !== 'tilt') stopSensor(); else syncSensorLifecycle(); updateOrientation();
  }
  function saveOptions() { saveNames(); if (!capable) return; for (const [id, key] of [['mobileOrientation', 'orientation'], ['mobileMovement', 'movement'], ['mobileSensitivity', 'sensitivity'], ['mobileDeadzone', 'deadzone'], ['mobileInvertY', 'invertY'], ['touchMode', 'touchMode'], ['mobileButtonSize', 'buttonSize'], ['mobileOpacity', 'opacity']]) settings[key] = $(`#${id}`).value; saveSettings(); applySettings(); }

  function orientationAngle() { return Number(screen.orientation?.angle ?? window.orientation ?? 0); }
  function sensorAxes(beta, gamma) { const angle = ((orientationAngle() % 360) + 360) % 360; if (angle === 90) return { x: beta, y: -gamma }; if (angle === 270) return { x: -beta, y: gamma }; if (angle === 180) return { x: -gamma, y: -beta }; return { x: gamma, y: beta }; }
  function onOrientation(event) {
    const now = performance.now(); if (now - lastSensorEvent < 14 || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return; lastSensorEvent = now; const axes = sensorAxes(event.beta, event.gamma); sensorValidAt = now; if (!center) center = axes;
    const target = { x: axes.x - center.x, y: axes.y - center.y }; filtered.x += (target.x - filtered.x) * CONFIG.smoothing; filtered.y += (target.y - filtered.y) * CONFIG.smoothing;
  }
  function startSensor() { if (!capable || sensorPermission !== 'granted' || sensorListening) return; addEventListener('deviceorientation', onOrientation, { passive: true }); sensorListening = true; sensorStartedAt = performance.now(); }
  function stopSensor() { if (sensorListening) removeEventListener('deviceorientation', onOrientation); sensorListening = false; filtered = { x: 0, y: 0 }; }
  function syncSensorLifecycle() { if (settings.movement === 'tilt' && sensorPermission === 'granted' && (selectedGameVisible() || $('#optionsScreen').classList.contains('visible'))) startSensor(); else stopSensor(); }
  async function requestSensor() {
    if (!capabilities.orientation) return useJoystick('Sensor no disponible. Usando joystick táctil.');
    try { const permission = typeof DeviceOrientationEvent.requestPermission === 'function' ? await DeviceOrientationEvent.requestPermission() : 'granted'; if (permission !== 'granted') throw new Error('denied'); sensorPermission = 'granted'; settings.movement = 'tilt'; saveSettings(); center = null; fallbackNotified = false; $('#mobileSensorStatus').textContent = 'Sensor activado. Mantén el teléfono cómodo y calibra.'; applySettings(); startSensor(); toast('Sensor de inclinación activado'); }
    catch (_) { sensorPermission = 'denied'; useJoystick('Permiso rechazado. Usando joystick táctil.'); }
  }
  function calibrate(notify = true) { if (sensorPermission !== 'granted' || !sensorValidAt) { if (notify) toast('Activa el sensor y espera una lectura válida'); return false; } center = sensorAxesFromFiltered(); filtered = { x: 0, y: 0 }; fallbackNotified = false; if (notify) toast('Inclinación calibrada'); return true; }
  function sensorAxesFromFiltered() { const current = center || { x: 0, y: 0 }; return { x: current.x + filtered.x, y: current.y + filtered.y }; }
  function useJoystick(message) { settings.movement = 'joystick'; saveSettings(); stopSensor(); applySettings(); $('#mobileSensorStatus').textContent = message; toast(message); }
  function normalizedAxis(value) { const dead = CONFIG.deadzone[settings.deadzone], magnitude = Math.abs(value); if (magnitude <= dead) return 0; return Math.sign(value) * Math.min(1, ((magnitude - dead) / (CONFIG.tiltLimit - dead)) * CONFIG.sensitivity[settings.sensitivity]); }
  function getVector() {
    if (!capable || !selectedGameVisible()) return { active: false, x: 0, y: 0 };
    if (settings.movement === 'joystick') return { active: true, x: joystick.x, y: joystick.y };
    const now = performance.now(); if (sensorPermission !== 'granted') { if (!fallbackNotified) { fallbackNotified = true; useJoystick('Activa el sensor en Opciones. Usando joystick táctil.'); } return { active: true, x: joystick.x, y: joystick.y }; }
    if (sensorListening && now - sensorStartedAt > CONFIG.sensorTimeout && now - sensorValidAt > CONFIG.sensorTimeout) { if (!fallbackNotified) { fallbackNotified = true; useJoystick('Sensor sin datos. Usando joystick táctil.'); } return { active: true, x: joystick.x, y: joystick.y }; }
    return { active: true, x: normalizedAxis(filtered.x), y: normalizedAxis(filtered.y) * (settings.invertY === 'yes' ? -1 : 1) };
  }

  function setupJoystick() { const zone = $('#touchJoystick'), knob = $('#touchJoystickKnob'); const reset = () => { joystick = { x: 0, y: 0, pointer: null }; knob.style.transform = 'translate(0,0)'; }; zone.addEventListener('pointerdown', event => { event.preventDefault(); joystick.pointer = event.pointerId; zone.setPointerCapture(event.pointerId); move(event); }); zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', reset); zone.addEventListener('pointercancel', reset); function move(event) { if (joystick.pointer !== event.pointerId) return; const rect = zone.getBoundingClientRect(), radius = rect.width * .34, dx = event.clientX - (rect.left + rect.width / 2), dy = event.clientY - (rect.top + rect.height / 2), length = Math.hypot(dx, dy), scale = length > radius ? radius / length : 1; joystick.x = dx * scale / radius; joystick.y = dy * scale / radius; knob.style.transform = `translate(${dx * scale}px,${dy * scale}px)`; } }
  function setupActions() { document.querySelectorAll('#touchControls [data-key]').forEach(button => { const key = button.dataset.key; const down = event => { event.preventDefault(); button.classList.add('pressed'); dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }; const up = event => { event.preventDefault(); button.classList.remove('pressed'); dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })); }; button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('pointerleave', up); }); $('#touchPauseButton').addEventListener('click', () => dispatchEvent(new Event('void-toggle-pause'))); }
  async function enterFullscreen() { if (!capable || !document.fullscreenEnabled) return toast('Pantalla completa no disponible'); try { await $('#game').requestFullscreen(); await lockOrientation(); } catch (_) { toast('No se pudo activar pantalla completa'); } }
  async function lockOrientation() { if (!document.fullscreenElement || settings.orientation === 'auto' || !screen.orientation?.lock) return; try { await screen.orientation.lock(settings.orientation); } catch (_) { toast(`Gira el dispositivo para jugar en ${settings.orientation === 'landscape' ? 'horizontal' : 'vertical'}`); } }
  function onFullscreen() { resizeDispatch(); if (!document.fullscreenElement) { try { screen.orientation?.unlock?.(); } catch (_) {} } else lockOrientation(); }
  function resizeDispatch() { updateOrientation(); dispatchEvent(new Event('resize')); }
  function resetMobile() { settings = { ...CONFIG.defaults, movement: capabilities.orientation ? 'tilt' : 'joystick' }; saveSettings(); center = null; filtered = { x: 0, y: 0 }; applySettings(); toast('Controles móviles restablecidos'); }

  names.forEach((name, index) => { $(`#pilotName${index + 1}`).value = name; }); updatePilotCards();
  if (!capabilities.orientation) { settings.movement = 'joystick'; saveSettings(); } document.body.classList.toggle('mobile-capable', capable); if (capable) { setupJoystick(); setupActions(); } applySettings();
  document.querySelectorAll('[data-edit-pilot]').forEach(button => button.addEventListener('click', () => { dispatchEvent(new CustomEvent('void-show-game-screen', { detail: 'options' })); requestAnimationFrame(() => $(`#pilotName${button.dataset.editPilot}`).focus()); }));
  $('#mobileFullscreenButton').addEventListener('click', enterFullscreen); $('#mobileSensorButton').addEventListener('click', requestSensor); $('#mobileCalibrateButton').addEventListener('click', () => calibrate(true)); $('#mobileResetButton').addEventListener('click', resetMobile);
  $('#closeOptionsButton').addEventListener('click', saveOptions); document.querySelectorAll('#mobileSettings select').forEach(select => select.addEventListener('change', saveOptions));
  addEventListener('void-screen-change', event => { syncSensorLifecycle(); applySettings(); if (capable && !event.detail?.id && !sessionStorage.getItem('spaceShooter.fullscreenHint')) { sessionStorage.setItem('spaceShooter.fullscreenHint', '1'); toast('Consejo: usa pantalla completa desde Opciones'); } if (event.detail?.id === 'startScreen') { try { screen.orientation?.unlock?.(); } catch (_) {} } }); addEventListener('void-game-started', () => { syncSensorLifecycle(); applySettings(); }); addEventListener('void-player-count', updateDevices); addEventListener('gamepadconnected', updateDevices); addEventListener('gamepaddisconnected', updateDevices); addEventListener('resize', updateOrientation); addEventListener('orientationchange', updateOrientation); screen.orientation?.addEventListener?.('change', updateOrientation); document.addEventListener('fullscreenchange', onFullscreen);
  window.VoidMobile = { capable, capabilities, config: CONFIG, getVector, saveNames, names: () => [...names], settings: () => ({ ...settings }), requestSensor, calibrate, applySettings, debug: () => ({ capable, capabilities, settings: { ...settings }, names: [...names], sensorPermission, sensorListening, sensorValid: Boolean(sensorValidAt), vector: getVector(), orientation: physicalOrientation(), fullscreen: Boolean(document.fullscreenElement) }) };
})();
