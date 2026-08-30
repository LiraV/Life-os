// Облако: вход через Google и одна строка с данными на человека.
//
// Главное правило здесь одно: **облако — это копия, а не хозяин**. Записи
// живут на устройстве и работают без сети; облако нужно, чтобы телефон и
// ноутбук видели одно и то же. Поэтому ни одна ошибка сети, ни пустое облако,
// ни неудачный вход не могут стереть то, что уже лежит на устройстве.
//
// При первом входе данные не «заменяются облачными», а сливаются с ними и
// отправляются обратно: то, что человек вёл до входа, — такие же его данные,
// как и всё остальное.

import { CLOUD, cloudReady } from './cloud-config.js';
import { adoptState, stateSnapshot, S } from './store.js';
import { merge } from './sync.js';

const KEY = 'lifeos.cloud';
const TABLE = 'states';

let session = load();
let listeners = [];
let syncing = false;
let lastPull = 0;

export const onCloud = fn => { listeners.push(fn); };
const tell = () => listeners.forEach(fn => fn());

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function keep(next) {
  session = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch { /* нет места — синхронизация подождёт, данные важнее */ }
  tell();
}

/** Что в токене: почта и кто это. Читаем без проверки подписи — её проверяет база. */
function claims(token) {
  try {
    const body = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(body))));
  } catch { return null; }
}

export const configured = cloudReady;
export const signedIn = () => !!session?.access_token;
export const account = () => (session ? claims(session.access_token) : null);
export const lastSync = () => session?.syncedAt || '';
export const busy = () => syncing;

/**
 * Возврат из Google. Токены приходят в адресной строке после решётки — там же,
 * где у нас живёт маршрут экрана, — поэтому забираем их до того, как роутер
 * успеет увидеть чужой адрес, и убираем из строки: токену в истории браузера
 * делать нечего.
 */
export function consumeRedirect() {
  const hash = location.hash || '';
  if (!hash.includes('access_token=')) return false;
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const access_token = q.get('access_token');
  if (!access_token) return false;
  keep({
    access_token,
    refresh_token: q.get('refresh_token') || '',
    expires_at: Date.now() + (Number(q.get('expires_in')) || 3600) * 1000,
    syncedAt: '',
  });
  history.replaceState(history.state, '', location.pathname + location.search + '#/settings');
  return true;
}

/** Уйти к Google. Возвращаемся на ту же страницу — приложение статическое. */
export function signIn() {
  if (!configured()) return;
  const back = location.origin + location.pathname;
  location.href = `${CLOUD.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}

/** Выйти. Данные на устройстве остаются: это его данные, а не облачные. */
export function signOut() {
  keep(null);
}

async function fresh() {
  if (!session) return null;
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  if (!session.refresh_token) return session.access_token;
  const r = await fetch(`${CLOUD.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: CLOUD.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!r.ok) throw new Error('вход устарел');
  const j = await r.json();
  keep({
    access_token: j.access_token,
    refresh_token: j.refresh_token || session.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    syncedAt: session.syncedAt || '',
  });
  return j.access_token;
}

const headers = token => ({
  apikey: CLOUD.key,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/** Что лежит в облаке. null — там пока ничего нет, и это нормально. */
async function pull(token) {
  const r = await fetch(`${CLOUD.url}/rest/v1/${TABLE}?select=data`, { headers: headers(token) });
  if (!r.ok) throw new Error(`облако не ответило (${r.status})`);
  const rows = await r.json();
  return rows?.[0]?.data || null;
}

async function push(token, data) {
  const uid = claims(token)?.sub;
  const r = await fetch(`${CLOUD.url}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { ...headers(token), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: uid, data, changed_at: data.changedAt || '' }),
  });
  if (!r.ok) throw new Error(`не удалось отправить (${r.status})`);
}

/**
 * Свести устройство с облаком. Порядок важен: сначала забрать, потом слить,
 * и только потом отправить. Обратный порядок затирал бы то, что записали на
 * другом устройстве, ещё до того, как мы это увидим.
 */
export async function syncNow() {
  if (!configured() || !signedIn() || syncing) return { ok: false, reason: 'нечего делать' };
  syncing = true; tell();
  try {
    const token = await fresh();
    const remote = await pull(token);
    const local = stateSnapshot();
    const next = remote ? merge(local, remote) : local;
    // Принимаем только если облако что-то добавило: лишняя перерисовка на
    // ровном месте сбивает набранный текст и прокрутку.
    if (remote && JSON.stringify(next) !== JSON.stringify(local)) adoptState(next);
    await push(token, next);
    keep({ ...session, syncedAt: new Date().toISOString() });
    return { ok: true, first: !remote };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) };
  } finally {
    syncing = false; tell();
  }
}

/** Отправить, не забирая: после правки, чтобы не гонять слияние на каждый тап. */
let timer = null;
export function pushSoon(ms = 4000) {
  if (!configured() || !signedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, ms);
}

/** Забрать при возвращении на вкладку, но не чаще раза в минуту. */
export function pullIfStale() {
  if (!configured() || !signedIn()) return;
  if (Date.now() - lastPull < 60000) return;
  lastPull = Date.now();
  syncNow();
}
