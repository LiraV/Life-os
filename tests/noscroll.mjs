// Экран не должен ездить вбок ни на одном разделе — при любых данных.
// Внутренние горизонтальные области (таблица года, доска учёбы) — должны.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const LONG = 'Конный спорт и верховая езда по выходным утром';
const NOSPACE = 'Дописатьоченьдлинноесловобезпробеловвообщесовсемпрямоочень';
await ctx.addInitScript(([long, nosp]) => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const t = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 17, onboarded: true, user: { name: nosp, chronotype: 'сова', traits: [], xp: 320, createdAt: t },
    quests: { [t]: [{ id: 'q1', title: nosp, time: '19:30', dur: 90, sphere: 'sport', boss: true },
                    { id: 'q2', title: long, sphere: 'edu', lessonId: 'l1' }] },
    goals: [{ id: 'g1', title: nosp, horizon: 'year', period: String(new Date().getFullYear()), slots: [], target: 12, unit: 'занятий', current: 3 },
            { id: 'g2', title: long, horizon: 'month', period: t.slice(0, 7), slots: [], steps: [{ id: 'st1', title: nosp, done: false }] }],
    habits: [{ id: 'h1', name: nosp, target: 2000, step: 250, unit: 'мл', log: { [t]: 500 } }],
    lessons: [{ id: 'l1', name: nosp, kind: 'practice', perMonth: 8, cost: 4000, log: {}, items: [] }],
    study: { places: [{ id: 'p1', name: nosp }], subjects: [{ id: 's1', placeId: 'p1', name: nosp }],
             tasks: [{ id: 't1', subjectId: 's1', title: nosp, stage: 'doing' }] },
    sport: { exercises: [{ id: 'x1', name: nosp, unit: 'повторений', dir: 'up' }],
             templates: [{ id: 'tp1', name: nosp, sets: [{ id: 'ss1', exerciseId: 'x1', value: 12, reps: 4 }] }],
             workouts: [{ id: 'w1', date: t, title: nosp, goalId: 'g1', done: true,
                          sets: [{ id: 'sx', exerciseId: 'x1', value: 12, reps: 4, done: true }] }] },
    budget: { cats: { expense: [{ id: 'c1', name: nosp }], income: [{ id: 'c2', name: long }] },
              plans: {}, ops: [{ id: 'o1', date: t, kind: 'expense', catId: 'c1', sum: 12345, note: nosp }],
              vaults: [{ id: 'v1', name: nosp, start: 150000 }], rules: [nosp], start: 5000 },
    tracker: { rows: [{ id: 'r1', name: nosp, unit: 'часов' }], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {} },
    food: { targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 }, days: { [t]: { water: 500, entries: [{ id: 'f1', title: nosp, kcal: 500 }] } } },
    health: { days: { [t]: true }, measures: [], symptoms: [] },
    diary: [{ id: 'd1', date: t, text: nosp }], energy: {}, weeks: {}, years: {}, spheres: {}, intentions: {}, chat: [], tests: {}, ui: {},
  }));
}, [LONG, NOSPACE]);
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(900);

// Предложение про подсказки в тестах не участвует. Гасим его через состояние,
// а не кликом: так не ждём анимацию шторки и не зависим от её появления.
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; });
    closeSheet();
    // Сохранение в приложении отложенное, а тесты правят хранилище сразу —
    // поэтому дублируем запись, чтобы отказ не потерялся при перезагрузке.
    const raw = localStorage.getItem('lifeos.state');
    if (raw) {
      const cur = JSON.parse(raw);
      (cur.ui ||= {}).tips = 'off';
      localStorage.setItem('lifeos.state', JSON.stringify(cur));
    }
  } catch { /* страница без приложения — гасить нечего */ }
});

const routes = ['day', 'plans', 'inside', 'me', 'spheres', 'tracker', 'habits', 'body', 'diary', 'settings',
  'sport', 'study', 'edu', 'food', 'budget', 'care', 'spheres/sport', 'spheres/edu', 'spheres/money'];
let bad = 0;
for (const r of routes) {
  await p.evaluate(h => { location.hash = '#/' + h; }, r); await p.waitForTimeout(480);
  const x = await p.evaluate(() => {
    const scr = document.querySelector('.scr'), app = document.querySelector('.app');
    const lim = scr.getBoundingClientRect().right;
    const over = [...scr.querySelectorAll('*')]
      .filter(el => !el.closest('.tr-wrap, .board'))
      .map(el => ({ el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`, d: Math.round(el.getBoundingClientRect().right - lim) }))
      .filter(o => o.d > 1);
    // Экран не сдвигается вбок даже принудительно, но вниз крутится как прежде.
    scr.scrollLeft = 300; const moved = scr.scrollLeft; scr.scrollLeft = 0;
    const tall = scr.scrollHeight > scr.clientHeight + 2;
    scr.scrollTop = 150; const down = tall ? scr.scrollTop > 0 : null; scr.scrollTop = 0;
    return { docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
             appOver: app.scrollWidth - app.clientWidth, scrOver: scr.scrollWidth - scr.clientWidth,
             moved, down, touch: getComputedStyle(scr).touchAction,
             over: [...new Set(over.map(o => `${o.el} +${o.d}px`))].slice(0, 4) };
  });
  const ok = !x.docOver && !x.appOver && !x.scrOver && !x.over.length && !x.moved && x.touch === 'pan-y' && x.down !== false;
  if (!ok) bad++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${r.padEnd(15)}${x.down === true ? 'вниз крутится' : ''}`
    + `${ok ? '' : ` ✗ документ +${x.docOver} · .app +${x.appOver} · .scr +${x.scrOver} · сдвиг ${x.moved} · жесты ${x.touch} · вниз ${x.down} ${x.over.join('; ')}`}`);
}

// внутренние горизонтальные области ездить обязаны
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(600);
const tr = await p.evaluate(() => {
  const w = document.querySelector('.tr-wrap');
  if (!w) return null;
  const can = w.scrollWidth > w.clientWidth;
  w.scrollLeft = 200;
  return { can, moved: w.scrollLeft > 0, touch: getComputedStyle(w).touchAction };
});
console.log(tr && tr.can && tr.moved ? `  ✓ таблица года ездит вбок сама (touch-action: ${tr.touch})` : `  ✗ таблица года не ездит: ${JSON.stringify(tr)}`);
console.log(bad ? `✗ экранов с вылетом: ${bad}` : 'вылета нет ни на одном экране');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
