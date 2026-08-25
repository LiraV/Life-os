// Роутер и оболочка: рисует активный экран, нижний бар и drawer,
// раздаёт клики экрану через data-act.

import { S, onChange, update, updateQuiet, level } from './store.js';
import { todayISO } from './dates.js';
import { closeSheet, toast } from './ui.js';
import { reconcile } from './traits.js';

import * as onboarding from './screens/onboarding.js';
import * as day from './screens/day.js';
import * as plans from './screens/plans.js';
import * as spheres from './screens/spheres.js';
import * as habits from './screens/habits.js';
import * as health from './screens/health.js';
import * as inside from './screens/inside.js';
import * as me from './screens/me.js';
import * as settings from './screens/settings.js';
import * as tracker from './screens/tracker.js';
import * as food from './screens/food.js';
import * as budget from './screens/budget.js';
import * as edu from './screens/edu.js';
import * as study from './screens/study.js';
import * as sport from './screens/sport.js';
import * as care from './screens/care.js';
import { tipCard, tipActions, offerTips } from './tips.js';

const SCREENS = { day, plans, spheres, habits, health, inside, me, settings, tracker, food, budget, edu, study, sport, care };

const NAV = [
  { key: 'more', label: '☰ Ещё' },
  { key: 'day', label: 'День' },
  { key: 'plans', label: 'Планы' },
  { key: 'inside', label: 'Внутри' },
  { key: 'me', label: 'Я' },
];

const DRAWER = [
  { key: 'spheres', label: 'Сферы' },
  { key: 'habits', label: 'Привычки' },
  { key: 'tracker', label: 'Трекер года' },
  { key: 'health', label: 'Тело' },
  { key: 'care', label: 'Забота' },
  { key: 'inside/diary', label: 'Дневник' },
  { key: 'inside/tests', label: 'Тесты' },
  { key: 'settings', label: 'Настройки' },
];

const scr = document.getElementById('scr');
const nav = document.getElementById('nav');
const statusbar = document.getElementById('statusbar');
const app = document.getElementById('app');

let drawerOpen = false;
export const go = path => { location.hash = '#/' + path; };
const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

function activeScreen() {
  const [name] = route();
  return SCREENS[name] ? name : 'day';
}

function renderStatus() {
  const now = new Date();
  const t = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  statusbar.innerHTML = S.onboarded
    ? `<span>${t}</span><span><b>УР. ${level(S.user.xp)}</b> · ${S.user.xp} XP</span>`
    : '<span></span><span></span>';
}

function renderNav() {
  const cur = activeScreen();
  const drawerScreens = ['spheres', 'food', 'budget', 'edu', 'study', 'sport', 'habits', 'tracker', 'health', 'settings'];
  nav.hidden = !S.onboarded;
  nav.innerHTML = NAV.map(n => {
    const on = n.key === 'more' ? drawerScreens.includes(cur) : n.key === cur;
    return `<button data-nav="${n.key}" class="${on ? 'on' : ''}">${n.label}</button>`;
  }).join('');
}

function renderDrawer() {
  document.querySelector('.drawer-wrap')?.remove();
  if (!drawerOpen) return;
  const cur = route().join('/');
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `
    <div class="drawer">
      <div class="drawer-head">
        <div class="avatar">${(S.user.name || '?').trim().charAt(0).toUpperCase()}</div>
        <div>
          <div class="ink" style="font-weight:500">${S.user.name || 'Персонаж'}</div>
          <div class="lab">${S.user.chronotype} · ур. ${level(S.user.xp)}</div>
        </div>
      </div>
      ${DRAWER.map(d => `<button class="item ${cur === d.key ? 'on' : ''}" data-drawer="${d.key}">${d.label}</button>`).join('')}
    </div>`;
  app.appendChild(wrap);
  wrap.addEventListener('click', e => {
    if (e.target === wrap) { drawerOpen = false; renderDrawer(); return; }
    const btn = e.target.closest('[data-drawer]');
    if (btn) { drawerOpen = false; go(btn.dataset.drawer); }
  });
}

/**
 * Свести черты с фактами перед отрисовкой. Пишем тихо: перерисовка и так
 * идёт следом, а обычный update() здесь закольцевал бы рендер.
 */
function syncTraits() {
  if (!S.onboarded) return;
  let fresh = [];
  updateQuiet(s => { fresh = reconcile(s); });
  if (!fresh.length) return;
  const first = fresh[0];
  setTimeout(() => toast(fresh.length > 1
    ? `Новые черты: ${fresh.map(t => t.name).join(', ')}`
    : `Новая черта: ${first.icon} ${first.name}`), 400);
}

let lastKey = '';
export function render() {
  syncTraits();
  renderStatus();
  if (!S.onboarded) {
    nav.hidden = true;
    scr.innerHTML = onboarding.render(route());
    return;
  }
  const name = activeScreen();
  const params = route().slice(1);
  const key = name + '/' + params.join('/');
  const keep = key === lastKey ? scr.scrollTop : 0;
  scr.innerHTML = tipCard(name) + SCREENS[name].render(params);
  scr.scrollTop = keep;
  lastKey = key;
  renderNav();
  renderDrawer();
}

/** Делегирование: клик по [data-act] уходит в actions активного экрана. */
function dispatch(kind, e) {
  const el = e.target.closest(kind === 'click' ? '[data-act]' : '[data-change]');
  if (!el || !scr.contains(el)) return;
  const mod = S.onboarded ? SCREENS[activeScreen()] : onboarding;
  const name = kind === 'click' ? el.dataset.act : el.dataset.change;
  // Подсказка живёт над экраном, поэтому её кнопки ловим до экранных.
  const fn = tipActions[name] || (mod.actions && mod.actions[name]);
  if (!fn) { console.warn('[lifeos] нет обработчика', name); return; }
  fn({ ...el.dataset, value: el.value, checked: el.checked }, el, e);
}

scr.addEventListener('click', e => dispatch('click', e));
scr.addEventListener('change', e => dispatch('change', e));
scr.addEventListener('input', e => {
  const live = e.target.closest('[data-live]');
  if (live && scr.contains(live)) {
    const out = document.getElementById(live.dataset.live);
    if (out) out.textContent = live.dataset.suffix ? live.value + live.dataset.suffix : live.value;
  }
  // Отдельная ветка для того, что должно записываться прямо во время движения.
  const el = e.target.closest('[data-act-input]');
  if (!el || !scr.contains(el)) return;
  const mod = S.onboarded ? SCREENS[activeScreen()] : onboarding;
  mod.actions?.[el.dataset.actInput]?.({ ...el.dataset, value: el.value }, el, e);
});
scr.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[data-act-enter]')) {
    e.preventDefault();
    const mod = S.onboarded ? SCREENS[activeScreen()] : onboarding;
    mod.actions[e.target.dataset.actEnter]?.({ ...e.target.dataset, value: e.target.value }, e.target, e);
  }
});

nav.addEventListener('click', e => {
  const btn = e.target.closest('[data-nav]');
  if (!btn) return;
  closeSheet();
  if (btn.dataset.nav === 'more') { drawerOpen = !drawerOpen; renderDrawer(); return; }
  drawerOpen = false;
  go(btn.dataset.nav);
});

window.addEventListener('hashchange', () => { closeSheet(); drawerOpen = false; render(); });
onChange(render);

// Смена суток на открытом экране: перерисовать, чтобы «сегодня» осталось сегодня.
let seenDay = todayISO();
setInterval(() => {
  renderStatus();
  if (todayISO() !== seenDay) { seenDay = todayISO(); update(s => { s.ui.date = seenDay; }); }
}, 30000);

if (!location.hash) location.hash = '#/day';
render();

// Предложение про подсказки — после того, как персонаж уже заведён.
setTimeout(offerTips, 600);

// Приложение должно само догонять выложенную версию: спрашиваем воркер об
// обновлении при запуске и при возврате на вкладку, а когда новый воркер
// перехватывает управление — один раз перезагружаемся, чтобы поехал новый код.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      reg.update();
      // Новый воркер уже готов, но ждёт закрытия старых вкладок — торопим его.
      if (reg.waiting) reg.waiting.postMessage('skip-waiting');
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', function () {
          if (this.state === 'installed' && navigator.serviceWorker.controller) reg.waiting?.postMessage('skip-waiting');
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    } catch { /* без воркера приложение работает, просто без офлайна */ }
  });
}

window.addEventListener('error', e => {
  if (e.message) toast('Что-то пошло не так: ' + e.message.slice(0, 60));
});
