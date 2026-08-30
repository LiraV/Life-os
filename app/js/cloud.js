// Облако: вход через Яндекс ID и один файл с данными на человека.
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
import { adoptState, stateSnapshot } from './store.js';
import { merge } from './sync.js';

const KEY = 'lifeos.cloud';

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

export const configured = cloudReady;
export const signedIn = () => !!session?.access_token;
/** Кто вошёл — говорит не токен, а сама функция: она спрашивает у Яндекса. */
export const account = () => session?.account || null;
/** Заголовок для обращения к своей функции — им же ходит посредник к OpenAI. */
export const authHeader = () => (session ? { Authorization: `OAuth ${session.access_token}` } : {});
export const lastSync = () => session?.syncedAt || '';
export const busy = () => syncing;

/**
 * Возврат от Яндекса. Токен приходит в адресной строке после решётки — там же,
 * где у нас живёт маршрут экрана, — поэтому забираем его до того, как роутер
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
    expires_at: Date.now() + (Number(q.get('expires_in')) || 31536000) * 1000,
    account: null,
    syncedAt: '',
  });
  history.replaceState(history.state, '', location.pathname + location.search + '#/settings');
  return true;
}

/**
 * Адрес возврата. Яндекс сверяет его с записанным символ в символ, а открыть
 * приложение можно по-разному: с экрана «Домой» оно стартует с index.html на
 * конце, из браузера — без него. Поэтому приводим к одному виду, иначе вход
 * работал бы на ноутбуке и молча отказывал на телефоне.
 */
export const redirectUri = () =>
  (location.origin + location.pathname).replace(/index\.html$/, '');

/** Уйти к Яндексу. Возвращаемся на ту же страницу — приложение статическое. */
export function signIn() {
  if (!configured()) return;
  const back = redirectUri();
  location.href = 'https://oauth.yandex.ru/authorize?response_type=token'
    + `&client_id=${encodeURIComponent(CLOUD.clientId)}`
    + `&redirect_uri=${encodeURIComponent(back)}`;
}

/** Выйти. Данные на устройстве остаются: это его данные, а не облачные. */
export function signOut() {
  keep(null);
}

/**
 * Обмен с функцией. Токен Яндекса живёт долго и не обновляется на месте: если
 * он всё же протух, честнее попросить войти заново, чем делать вид, что
 * синхронизация идёт.
 */
async function call(method, body) {
  const r = await fetch(CLOUD.api + '/state', {
    method,
    headers: { Authorization: `OAuth ${session.access_token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (r.status === 401) { keep(null); throw new Error('вход устарел — войди снова'); }
  if (!r.ok) throw new Error(`облако ответило ${r.status}`);
  return r.json();
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
    const got = await call('GET');
    const remote = got.data || null;
    const local = stateSnapshot();
    const next = remote ? merge(local, remote) : local;
    // Принимаем только если облако что-то добавило: лишняя перерисовка на
    // ровном месте сбивает набранный текст и прокрутку.
    if (remote && JSON.stringify(next) !== JSON.stringify(local)) adoptState(next);
    await call('POST', next);
    keep({ ...session, account: got.account || session.account, syncedAt: new Date().toISOString() });
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
