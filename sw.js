// Офлайн-оболочка. Пути относительные — приложение живёт в подкаталоге на Pages.
// Версию поднимаем при любом изменении файлов из SHELL.
const VERSION = 'lifeos-v4';
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
  './app/js/screens/onboarding.js',
  './app/js/screens/day.js',
  './app/js/screens/plans.js',
  './app/js/screens/spheres.js',
  './app/js/screens/habits.js',
  './app/js/screens/health.js',
  './app/js/screens/inside.js',
  './app/js/screens/me.js',
  './app/js/screens/settings.js',
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
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      // Один недоступный файл не должен ронять всю установку.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Переходы: сначала сеть, при её отсутствии — сохранённая оболочка.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { caches.open(VERSION).then(c => c.put('./index.html', res.clone())); return res; })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))),
    );
    return;
  }

  // Шрифты Google — из кеша, обновляются в фоне.
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(
      caches.open(FONTS).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
