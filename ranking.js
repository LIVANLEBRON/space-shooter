(() => {
  'use strict';
  const RECORD_KEY = 'void-runner-best-record-v1', QUEUE_KEY = 'void-runner-record-queue-v1', UID_KEY = 'void-runner-firebase-auth-v1';
  const config = window.VOID_FIREBASE_CONFIG;
  const listeners = new Set(); let auth = null, syncing = false;
  const safeName = value => (String(value || '').replace(/[<>{}\[\]\\/"'`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Piloto anónimo');
  const load = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (_) { return null; } };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const compare = (a, b) => Number(Boolean(b.campaignCompleted)) - Number(Boolean(a.campaignCompleted)) || b.highestLevel - a.highestLevel || (b.finalBossProgress || (b.finalBossDefeated ? 100 : 0)) - (a.finalBossProgress || (a.finalBossDefeated ? 100 : 0)) || b.maxScore - a.maxScore;
  const better = (a, b) => Boolean(a) && (!b || compare(a, b) < 0);
  const normalize = record => ({ uid: record.uid || '', name: safeName(record.name), highestLevel: Math.max(0, Math.min(10, Math.floor(record.highestLevel || 0))), finalBossProgress: record.finalBossDefeated ? 100 : Math.max(0, Math.min(99, Math.floor(Number(record.finalBossProgress) || 0))), maxScore: Math.max(0, Math.floor(record.maxScore || 0)), boss5Defeated: Boolean(record.boss5Defeated), finalBossDefeated: Boolean(record.finalBossDefeated), campaignCompleted: Boolean(record.campaignCompleted), mode: record.playerCount === 2 ? 'cooperativo' : 'individual', playerCount: record.playerCount === 2 ? 2 : 1, updatedAt: record.updatedAt || new Date().toISOString() });
  const emit = message => listeners.forEach(fn => fn(message));
  function configured() { return Boolean(config?.apiKey && config?.projectId); }
  async function authenticate() {
    if (!configured()) throw new Error('Firebase no configurado');
    const cached = load(UID_KEY); if (cached?.idToken && cached?.expiresAt > Date.now() + 60000) return (auth = cached);
    if (cached?.refreshToken) {
      try { const refreshed = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cached.refreshToken }) }); if (refreshed.ok) { const data = await refreshed.json(); auth = { uid: data.user_id, idToken: data.id_token, refreshToken: data.refresh_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }; save(UID_KEY, auth); return auth; } } catch (_) { /* crea una sesión nueva si la renovación falla */ }
    }
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
    if (!response.ok) throw new Error('Autenticación anónima no disponible'); const data = await response.json();
    auth = { uid: data.localId, idToken: data.idToken, refreshToken: data.refreshToken, expiresAt: Date.now() + Number(data.expiresIn || 3600) * 1000 }; save(UID_KEY, auth); return auth;
  }
  const fields = record => ({ uid: { stringValue: record.uid }, name: { stringValue: record.name }, highestLevel: { integerValue: String(record.highestLevel) }, finalBossProgress: { integerValue: String(record.finalBossProgress) }, maxScore: { integerValue: String(record.maxScore) }, boss5Defeated: { booleanValue: record.boss5Defeated }, finalBossDefeated: { booleanValue: record.finalBossDefeated }, campaignCompleted: { booleanValue: record.campaignCompleted }, mode: { stringValue: record.mode }, playerCount: { integerValue: String(record.playerCount) } });
  function parseDocument(doc) { const f = doc.fields || {}; return normalize({ uid: f.uid?.stringValue, name: f.name?.stringValue, highestLevel: Number(f.highestLevel?.integerValue), finalBossProgress: Number(f.finalBossProgress?.integerValue), maxScore: Number(f.maxScore?.integerValue), boss5Defeated: f.boss5Defeated?.booleanValue, finalBossDefeated: f.finalBossDefeated?.booleanValue, campaignCompleted: f.campaignCompleted?.booleanValue, mode: f.mode?.stringValue, playerCount: Number(f.playerCount?.integerValue), updatedAt: f.updatedAt?.timestampValue }); }
  async function push(record) {
    const user = await authenticate(), ready = { ...record, uid: user.uid };
    const base = `projects/${config.projectId}/databases/(default)/documents`, documentUrl = `https://firestore.googleapis.com/v1/${base}/records/${encodeURIComponent(user.uid)}`;
    const existingResponse = await fetch(documentUrl, { headers: { Authorization: `Bearer ${user.idToken}` } });
    if (!existingResponse.ok && existingResponse.status !== 404) throw new Error('No se pudo consultar el récord anterior');
    if (existingResponse.ok) { const existing = parseDocument(await existingResponse.json()); if (!better(ready, existing)) return existing; }
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents:commit`;
    const body = { writes: [{ update: { name: `${base}/records/${user.uid}`, fields: fields(ready) }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] };
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${user.idToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error('No se pudo sincronizar'); return ready;
  }
  async function submit(input) {
    const candidate = normalize(input), current = load(RECORD_KEY); if (!better(candidate, current)) { await sync(); return current; }
    save(RECORD_KEY, candidate); save(QUEUE_KEY, candidate); emit('Récord guardado localmente'); void sync(); return candidate;
  }
  async function sync() {
    if (syncing || !navigator.onLine || !configured()) return false; const queued = load(QUEUE_KEY); if (!queued) return true; syncing = true; let retryNewer = false;
    try { const stored = await push(queued); const latest = load(QUEUE_KEY); retryNewer = Boolean(latest && JSON.stringify(latest) !== JSON.stringify(queued)); save(RECORD_KEY, better(latest, stored) ? latest : stored); if (!retryNewer) localStorage.removeItem(QUEUE_KEY); emit('Récord sincronizado'); return true; }
    catch (_) { emit('Récord guardado localmente'); return false; } finally { syncing = false; if (retryNewer) setTimeout(sync, 50); }
  }
  async function top(limit = 50) {
    if (!configured() || !navigator.onLine) { const local = load(RECORD_KEY); if (!local) throw new Error('Ranking no disponible'); return [local]; }
    try {
      const records = []; let pageToken = '';
      do {
        const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/records?pageSize=100${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
        const response = await fetch(url); if (!response.ok) throw new Error();
        const data = await response.json(); records.push(...(data.documents || []).map(parseDocument)); pageToken = data.nextPageToken || '';
      } while (pageToken);
      const local = load(RECORD_KEY);
      if (local) { const uid = local.uid || load(UID_KEY)?.uid; const index = records.findIndex(r => uid && r.uid === uid); if (index < 0) records.push(local); else if (better(local, records[index])) records[index] = local; }
      return records.sort(compare).slice(0, limit);
    } catch (_) { const local = load(RECORD_KEY); emit('Sin conexión al ranking global · mostrando récord local'); if (local) return [local]; throw new Error('Ranking no disponible'); }
  }

  addEventListener('online', sync);
  setTimeout(sync, 0);
  setInterval(sync, 30000);
  window.VoidRanking = { submit, sync, top, safeName, best: () => load(RECORD_KEY), configured, onStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }, compare: better };
})();
