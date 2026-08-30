// Роутер и оболочка: рисует активный экран, нижний бар и drawer,
// раздаёт клики экрану через data-act.

import { S, SPHERES, visibleSpheres, onChange, update, updateQuiet, level, loadError, rescueRaw, acceptFreshStart } from './store.js';
import { todayISO } from './dates.js';
import { go, route, markStep, startHere } from './nav.js';
import { consumeRedirect, onCloud, pushSoon, pullIfStale, signedIn } from './cloud.js';
import { closeSheet, toast } from './ui.js';
import { reconcile } from './traits.js';
import { applyAppIcon } from './appicon.js';
import { applyTheme } from './theme.js';

import * as onboarding from './screens/onboarding.js';
import * as day from './screens/day.js';
import * as plans from './screens/plans.js';
import * as spheres from './screens/spheres.js';
import * as inbox from './screens/inbox.js';
import * as work from './screens/work.js';
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
import * as library from './screens/library.js';
import * as trips from './screens/trips.js';
import * as free from './screens/free.js';
import * as biz from './screens/biz.js';
import { tipCard, tipActions, offerTips } from './tips.js';
import { workTodayCount } from './selectors.js';
import { avatarHtml } from './avatars.js';

const SCREENS = { day, plans, spheres, habits, health, inside, me, settings, tracker, food, budget, edu, study, sport, care, library, trips, inbox, work, free, biz };

const NAV = [
  { key: 'more', label: '☰ Ещё' },
  { key: 'day', label: 'День' },
  { key: 'plans', label: 'Планы' },
  { key: 'inside', label: 'Внутри' },
  { key: 'me', label: 'Я' },
];

/** Ноутбук: с этой ширины приложение перестаёт быть телефоном в рамке. */
const DESK = window.matchMedia('(min-width: 900px)');
export const isDesk = () => DESK.matches;

/**
 * Меню. Раньше здесь лежала половина экранов, а вторая открывалась только с
 * сетки сфер — и «Бюджет» с «Питанием», которые нужны каждый день, стоили три
 * тапа, а «Страны» — два. Теперь в меню есть всё: любой экран в двух тапах, а
 * сетка сфер остаётся витриной, а не единственной дверью.
 *
 * Сферы берём из списка сфер и в том же порядке: убранная с глаз сфера уходит
 * и из меню — «убрать с глаз» должно значить одно и то же везде.
 */
const sph = keys => keys
  .map(k => visibleSpheres().find(s => s.key === k))
  .filter(Boolean)
  .map(s => ({ key: s.screen || 'spheres/' + s.key, label: s.name }));

const MENU = () => [
  { head: 'Каждый день', items: [{ key: 'inbox', label: 'Инбокс' }, ...sph(['food', 'money', 'work'])] },
  { head: 'Сферы', items: [{ key: 'spheres', label: 'Все сферы' },
    ...sph(['sport', 'edu', 'study', 'free', 'biz', 'blog', 'books', 'trips'])] },
  { head: 'Тело и ритм', items: [...sph(['health']), { key: 'care', label: 'Забота' },
    { key: 'habits', label: 'Привычки' }, { key: 'tracker', label: 'Трекер года' }] },
  { head: 'Про себя', items: [{ key: 'inside/diary', label: 'Дневник' }, { key: 'inside/tests', label: 'Тесты' }] },
  { items: [{ key: 'settings', label: 'Настройки' }] },
];

const menuKeys = () => MENU().flatMap(g => g.items.map(i => i.key));

const scr = document.getElementById('scr');
const nav = document.getElementById('nav');
const statusbar = document.getElementById('statusbar');
const app = document.getElementById('app');

let drawerOpen = false;

/**
 * Шапка экрана прилипает к верху при прокрутке: заголовок, вкладки и стрелки
 * дат должны быть под рукой, а не уезжать вверх.
 *
 * Делается здесь, а не в девятнадцати экранах: экраны начинаются с одних и тех
 * же элементов, и их достаточно завернуть в один липкий блок. Несколько
 * липких соседей налезали бы друг на друга — поэтому именно обёртка.
 */

/**
 * Экран спасения. Появляется, только если сохранение не удалось прочитать.
 * Ничего не пишется на диск, пока человек не решил: выгрузить старые данные
 * и разобраться или начать заново. Молча стирать — не вариант.
 */
function renderRescue() {
  nav.hidden = true;
  scr.innerHTML = `
    <div class="title">Данные не прочитались</div>
    <div class="card">
      <div class="ink">Приложение не смогло открыть сохранение и пока ничего не записывает —
        чтобы не затереть то, что есть.</div>
      <div class="lab" style="margin-top:8px">Твои данные не удалены: они лежат отложенной копией.
        Скачай её — из этого файла всё восстанавливается.</div>
      <div class="lab">Причина: ${loadError}</div>
      <button class="btn" data-rescue="save">Скачать копию данных</button>
      <button class="btn-ghost" data-rescue="fresh">Начать заново — копию удалить</button>
    </div>`;
  scr.onclick = e => {
    const b = e.target.closest('[data-rescue]');
    if (!b) return;
    if (b.dataset.rescue === 'save') {
      const raw = rescueRaw();
      if (!raw) return toast('Копии нет');
      const a2 = document.createElement('a');
      a2.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      a2.download = `life-os-rescue-${todayISO()}.json`;
      a2.click();
      URL.revokeObjectURL(a2.href);
      toast('Копия скачана');
      return;
    }
    if (confirm('Начать заново? Отложенная копия будет удалена без возврата.')) {
      acceptFreshStart();
      location.reload();
    }
  };
}

const HEAD = ['title', 'sub', 'pills', 'row', 'stepper', 'lab'];

// Стекло под шапкой нужно только когда под неё что-то уехало: на нетронутом
// экране сплошная заливка читалась бы как приклеенная панель ни к чему.
scr.addEventListener('scroll', () => {
  scr.classList.toggle('scrolled', scr.scrollTop > 2);
}, { passive: true });

function stickHead() {
  const kids = [...scr.children];
  // Подсказка экрана остаётся прокручиваемой: она читается один раз.
  let i = kids[0]?.classList.contains('tip') ? 1 : 0;
  const head = [];
  for (; i < kids.length; i++) {
    if (!HEAD.some(c => kids[i].classList.contains(c))) break;
    head.push(kids[i]);
  }
  if (!head.length) return;

  const box = document.createElement('div');
  box.className = 'scr-head';
  scr.insertBefore(box, head[0]);
  head.forEach(el => box.appendChild(el));

  // Высокая шапка съедала бы экран. Лишнее сверху возвращаем в поток:
  // вкладки и фильтры полезнее заголовка, поэтому убираем с начала. Треть —
  // это примерно два ряда пилюль: на доске работы их три, и заголовок с
  // кнопкой «назад» честнее отпустить, чем держать полэкрана занятым.
  const max = scr.clientHeight / 3;
  while (box.children.length > 1 && box.offsetHeight > max) {
    scr.insertBefore(box.firstElementChild, box);
  }
  // Если и одна строка не влезает — липкой шапки на этом экране не будет.
  if (box.offsetHeight > max) {
    scr.insertBefore(box.firstElementChild, box);
    box.remove();
  }
}


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

/** Экраны сфер: открываются из «Сфер» и подсвечивают их. Берём из списка сфер,
 *  чтобы новая сфера не выпала из меню — так уже случилось с фрилансом. */
const SPHERE_SCREENS = new Set(SPHERES.filter(s => s.screen).map(s => s.screen));

/** Ключи нижнего бара — всё остальное живёт под «Ещё». */
const BAR = NAV.filter(n => n.key !== 'more').map(n => n.key);

/**
 * Какой пункт меню отвечает за текущий адрес. Точное совпадение важнее всего
 * (вкладки «Внутри» — отдельные пункты меню), потом сам экран, потом родитель:
 * «Питание» открывается из «Сфер», и подсветиться должны именно они.
 * Без этого меню молчало на семи экранах — человек не понимал, где он.
 */
function navKey(keys) {
  const cur = route().join('/');
  const name = activeScreen();
  if (keys.includes(cur)) return cur;
  if (keys.includes(name)) return name;
  return SPHERE_SCREENS.has(name) && keys.includes('spheres') ? 'spheres' : '';
}

/**
 * Навигация. На телефоне — пять кнопок снизу и ящик «Ещё»: больше туда не
 * влезает. На ноутбуке места хватает, поэтому боковая колонка показывает всё
 * сразу и ящик не нужен — лишний тап ради того, что и так помещается.
 */
function renderNav() {
  const act = navKey([...BAR, ...menuKeys()]);
  nav.hidden = !S.onboarded;
  if (!isDesk()) {
    nav.innerHTML = NAV.map(n => {
      const on = n.key === 'more' ? !BAR.includes(activeScreen()) : n.key === activeScreen();
      return `<button data-nav="${n.key}" class="${on ? 'on' : ''}">${n.label}</button>`;
    }).join('');
    return;
  }
  const item = (key, label) => `<button data-nav="${key}" class="${act === key ? 'on' : ''}">${label}</button>`;
  nav.innerHTML = `
    <div class="side-head">
      ${avatarHtml(S.user, 30)}
      <div><div class="ink" style="font-weight:500">${S.user.name || 'Персонаж'}</div>
        <div class="lab">ур. ${level(S.user.xp)}</div></div>
    </div>
    ${NAV.filter(n => n.key !== 'more').map(n => item(n.key, n.label)).join('')}
    ${MENU().map(g => `<div class="side-sep"></div>${g.head ? `<div class="menu-head">${g.head}</div>` : ''}${
      g.items.map(i => item(i.key, i.label)).join('')}`).join('')}`;
}

function renderDrawer() {
  document.querySelector('.drawer-wrap')?.remove();
  if (!drawerOpen) return;
  const act = navKey(menuKeys());
  const wrap = document.createElement('div');
  wrap.className = 'drawer-wrap';
  wrap.innerHTML = `
    <div class="drawer">
      <div class="drawer-head">
        ${avatarHtml(S.user)}
        <div>
          <div class="ink" style="font-weight:500">${S.user.name || 'Персонаж'}</div>
          <div class="lab">${S.user.chronotype} · ур. ${level(S.user.xp)}</div>
        </div>
      </div>
      ${MENU().map(g => `${g.head ? `<div class="menu-head">${g.head}</div>` : '<div class="menu-sep"></div>'}${
        g.items.map(d => {
          // Тихий счётчик: рабочее на сегодня видно, только когда открываешь меню.
          // На «Дне» рабочих задач нет намеренно — они не должны отвлекать.
          const n = d.key === 'work' ? workTodayCount() : 0;
          return `<button class="item ${act === d.key ? 'on' : ''}" data-drawer="${d.key}">${d.label}${
            n ? `<span class="item-n">${n}</span>` : ''}</button>`;
        }).join('')}`).join('')}
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

/** Класс режима на оболочке: по нему всё остальное решает вёрстка. */
function syncDesk() {
  app.classList.toggle('desk', isDesk());
  if (isDesk()) { drawerOpen = false; renderDrawer(); }
}
DESK.addEventListener('change', () => { syncDesk(); renderNav(); render(); });

// Тему ставим сразу при загрузке модуля, а не только в render: иначе первый
// кадр успевает мелькнуть цветами рассвета поверх выбранной.
applyTheme();

let lastKey = '';
export function render() {
  // Сначала — не удалось ли прочитать данные. Иначе человека встретит
  // онбординг поверх целых, но непрочитанных данных: выглядит как «всё стёрлось».
  if (loadError) return renderRescue();
  // Режим ноутбука — до всего остального: онбординг тоже экран, и он оставался
  // телефонной колонкой посреди широкого окна.
  applyTheme();
  syncDesk();
  syncTraits();
  renderStatus();
  applyAppIcon();
  if (!S.onboarded) {
    nav.hidden = true;
    scr.innerHTML = onboarding.render(route());
    return;
  }
  // Неизвестный адрес показывал «День», оставляя в строке чужой хеш: экран
  // говорил одно, адрес другое, и меню подсвечивало «День» неизвестно от чего.
  const asked = route()[0];
  if (asked && !SCREENS[asked]) { location.replace('#/day'); return; }
  const name = activeScreen();
  const params = route().slice(1);
  const key = name + '/' + params.join('/');
  const keep = key === lastKey ? scr.scrollTop : 0;
  // Доска работы — единственный экран, которому тесно в телефонной рамке:
  // на широком экране приложение раскрывается во всю ширину.
  // Доска работы и трекер года шире прочего: им отдаём всю ширину без колонок.
  const workTab = name === 'work' ? (params[0] || S.ui.workTab || 'now') : '';
  app.classList.toggle('wide', name === 'tracker' || workTab === 'board');
  // Сбой в одном экране не должен оборачиваться пустой страницей: пустой экран
  // невозможно ни понять, ни починить, а сообщение — можно.
  try {
    scr.innerHTML = tipCard(name) + SCREENS[name].render(params);
  } catch (e) {
    console.error('[lifeos] экран не отрисовался', name, e);
    scr.innerHTML = `
      <div class="title">Экран не открылся</div>
      <div class="card">
        <div class="ink">Что-то сломалось при отрисовке «${name}». Данные целы — это ошибка показа.</div>
        <div class="lab" style="margin-top:6px">${String(e?.message || e)}</div>
        <div class="lab">Остальные разделы работают: перейди в другой и вернись.</div>
      </div>`;
  }
  stickHead();
  scr.classList.toggle('scrolled', scr.scrollTop > 2);
  SCREENS[name].afterRender?.();
  // Переписка открывается снизу: видно поле ввода и последние сообщения.
  if (SCREENS[name].stickBottom?.(params)) {
    scr.scrollTop = scr.scrollHeight;
    requestAnimationFrame(() => { scr.scrollTop = scr.scrollHeight; });
  } else {
    scr.scrollTop = keep;
  }
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

window.addEventListener('hashchange', () => {
  // Токен может прийти и в уже открытое приложение — например, когда браузер
  // возвращает страницу из памяти. Забираем его раньше роутера: иначе тот
  // увидит неизвестный адрес, заменит его на «День» и унесёт токен с собой.
  if (consumeRedirect()) { pullIfStale(); render(); return; }
  closeSheet(); drawerOpen = false; markStep(); render();
});
onChange(render);

// Смена суток на открытом экране: перерисовать, чтобы «сегодня» осталось сегодня.
let seenDay = todayISO();
setInterval(() => {
  renderStatus();
  if (todayISO() !== seenDay) { seenDay = todayISO(); update(s => { s.ui.date = seenDay; }); }
}, 30000);

// Возврат от Google приходит токеном в адресной строке — там же, где живёт
// маршрут экрана. Забираем его до роутера, иначе приложение попыталось бы
// открыть экран с именем «access_token».
const cameBack = consumeRedirect();

// Заменяем, а не добавляем: лишняя запись без хеша означала бы, что первое
// же «назад» уводит на пустой адрес и приложение тут же возвращает себя.
if (!location.hash) location.replace('#/day');
startHere();
render();

// Предложение про подсказки — после того, как персонаж уже заведён.
setTimeout(offerTips, 600);

// Облако: перерисовываем, когда меняется состояние входа, забираем чужие
// правки при запуске и при возвращении на вкладку, а свои отправляем следом
// за изменением — но не на каждый тап, а чуть погодя.
onCloud(render);
if (signedIn()) setTimeout(pullIfStale, cameBack ? 200 : 1200);
onChange(() => pushSoon());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pullIfStale();
});

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
