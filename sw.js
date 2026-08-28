// Офлайн-оболочка. Пути относительные — приложение живёт в подкаталоге на Pages.
//
// Код приложения отдаётся из сети в первую очередь, кеш — только запасной
// вариант офлайна. Обратный порядок означал бы, что после выкладки на телефоне
// ещё долго крутится старая сборка.
const VERSION = 'lifeos-v67';
const ASSETS = 'lifeos-assets-v1';
const FONTS = 'lifeos-fonts-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './app/css/app.css',
  './app/js/main.js',
  './app/js/store.js',
  './app/js/dates.js',
  './app/js/selectors.js',
  './app/js/ui.js',
  './app/js/version.js',
  './app/js/traits.js',
  './app/js/xlsx.js',
  './app/js/ai.js',
  './app/js/screens/onboarding.js',
  './app/js/screens/day.js',
  './app/js/screens/plans.js',
  './app/js/screens/spheres.js',
  './app/js/screens/habits.js',
  './app/js/screens/health.js',
  './app/js/screens/inside.js',
  './app/js/screens/me.js',
  './app/js/screens/settings.js',
  './app/js/screens/tracker.js',
  './app/js/screens/food.js',
  './app/js/screens/budget.js',
  './app/js/screens/edu.js',
  './app/js/screens/study.js',
  './app/js/screens/sport.js',
];

const MEDIA = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './assets/illustration_01.png',
  './assets/illustration_02.png',
  './assets/illustration_03.png',
  './assets/illustration_04.png',
  './assets/illustration_05.png',
  './assets/illustration_06.png',
  './assets/illustration_09.png',
  './assets/illustration_10.png',
  './assets/avatars/a1.webp',
  './assets/avatars/a2.webp',
  './assets/avatars/a3.webp',
  './assets/avatars/a4.webp',
  './assets/avatars/a5.webp',
  './assets/avatars/a6.webp',
  './assets/avatars/a7.webp',
  './assets/avatars/a8.webp',
  './assets/avatars/a9.webp',
  './assets/avatars/a10.webp',
];

const isMedia = url => /\.(png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const code = await caches.open(VERSION);
    // Один недоступный файл не должен ронять всю установку.
    await Promise.allSettled(SHELL.map(u => code.add(u)));
    const media = await caches.open(ASSETS);
    await Promise.allSettled(MEDIA.map(u => media.match(u).then(hit => hit || media.add(u))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [VERSION, ASSETS, FONTS];
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Из сети мимо HTTP-кеша, с записью в кеш; офлайн — из кеша.
 *  Навигационный запрос нельзя пересобрать с параметрами — Safari бросает
 *  на этом исключение, поэтому строим новый запрос по адресу. */
async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const isNav = req.mode === 'navigate';
  const outgoing = isNav ? new Request(req.url, { cache: 'no-store', credentials: 'same-origin' }) : req;
  try {
    const res = await fetch(outgoing, isNav ? undefined : { cache: 'no-store' });
    if (res && res.ok) cache.put(isNav ? './index.html' : req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(isNav ? './index.html' : req) || await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}

/** Из кеша, обновление в фоне — для картинок и шрифтов, которые не меняются. */
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    e.respondWith(
      networkFirst(req, VERSION).catch(() => caches.match('./index.html').then(r => r || caches.match('./'))),
    );
    return;
  }

  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(cacheFirst(req, FONTS));
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(isMedia(url) ? cacheFirst(req, ASSETS) : networkFirst(req, VERSION));
});

// Кнопка «Обновить приложение» в настройках просит воркер уступить место сразу.
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
