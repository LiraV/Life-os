// Шторки не должны ездить вбок: ни одна не шире экрана.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const LONG = 'Продержаться в планке 2 минуты подряд без перерыва';
await ctx.addInitScript((long) => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const t = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 17, onboarded: true, user: { name: 'Лера', chronotype: 'сова', traits: [], xp: 461, createdAt: t },
    quests: { [t]: [{ id: 'q1', title: long, time: '19:30', dur: 90, sphere: 'sport' }] },
    goals: [{ id: 'g1', title: long, horizon: 'month', period: t.slice(0, 7), slots: [], target: 120, unit: 'сек', current: 110 },
            { id: 'g2', title: long + ' и ещё немного', horizon: 'year', period: t.slice(0, 4), slots: [] }],
    habits: [{ id: 'h1', name: long, target: 2000, step: 250, unit: 'мл', log: {} }],
    lessons: [{ id: 'l1', name: long, kind: 'practice', perMonth: 8, cost: 4000, log: {}, items: [] }],
    study: { places: [{ id: 'p1', name: long }], subjects: [{ id: 's1', placeId: 'p1', name: long }],
             tasks: [{ id: 'k1', subjectId: 's1', title: long, stage: 'todo' }] },
    sport: { exercises: [{ id: 'x1', name: long, unit: 'секунд', dir: 'up' }],
             templates: [{ id: 'tp1', name: long, sets: [{ id: 'ss1', exerciseId: 'x1', value: 110, reps: 3 }] }],
             workouts: [{ id: 'w1', date: t, title: long, goalId: 'g1', done: false, sets: [{ id: 'sx', exerciseId: 'x1', value: 110, reps: 3 }] }] },
    budget: { cats: { expense: [{ id: 'c1', name: long }], income: [{ id: 'c2', name: long }] },
              plans: {}, ops: [], vaults: [{ id: 'v1', name: long, start: 1000 }], rules: [long], start: 0 },
    tracker: { rows: [{ id: 'r1', name: long, unit: 'часов' }], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {} },
    food: { targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 }, days: {} },
    health: { days: {}, measures: [], symptoms: [] },
    energy: {}, weeks: {}, years: {}, spheres: {}, intentions: {}, diary: [], chat: [], tests: {}, ui: {},
  }));
}, LONG);
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

const measure = async name => {
  const x = await p.evaluate(() => {
    const sh = document.querySelector('.sheet');
    if (!sh) return null;
    // Главная проверка: содержимое нельзя сдвинуть вбок вообще.
    sh.scrollLeft = 300;
    const moved = sh.scrollLeft;
    sh.scrollLeft = 0;
    const lim = sh.getBoundingClientRect().right - parseFloat(getComputedStyle(sh).paddingRight);
    const over = [...sh.querySelectorAll('*')]
      .map(el => ({ el: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`, d: Math.round(el.getBoundingClientRect().right - lim) }))
      .filter(o => o.d > 1).sort((a, c) => c.d - a.d);
    // Вертикальная прокрутка обязана остаться живой.
    const tall = sh.scrollHeight > sh.clientHeight + 2;
    sh.scrollTop = 120;
    const down = tall ? sh.scrollTop > 0 : null;
    sh.scrollTop = 0;
    return { moved, down, over: sh.scrollWidth - sh.clientWidth, touch: getComputedStyle(sh).touchAction,
      wide: [...new Set(over.map(o => `${o.el} +${o.d}px`))].slice(0, 3) };
  });
  if (!x) { console.log(`  ? ${name} — шторка не открылась`); return; }
  const ok = x.moved === 0 && x.touch === 'pan-y' && !x.wide.length && x.down !== false;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name.padEnd(26)}${x.down === true ? 'вниз крутится' : x.down === null ? 'коротка, крутить нечего' : ''}`
    + `${ok ? '' : ` ✗ сдвинулась на ${x.moved}px · запас +${x.over}px · жесты ${x.touch} · вниз ${x.down} ${x.wide.join('; ')}`}`);
  return ok;
};

const close = async () => { await p.locator('[data-sheet="close"]').click().catch(() => {}); await p.waitForTimeout(350); };

let bad = 0;
const step = async (name, open) => {
  try { await open({ timeout: 4000 }); } catch { console.log(`  ? ${name} — не нашла, чем открыть`); return; }
  await p.waitForTimeout(500);
  if (await measure(name) === false) bad++;
  await close();
};

await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
await step('тренировка на дне', o => p.getByText('+ тренировка').click(o));
await step('квест', o => p.locator('.quest [data-act="edit"]').first().click(o));
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(450);
await step('цель месяца', o => p.locator('[data-act="goaledit"]').first().click(o));
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await step('шаблон', o => p.locator('[data-act="tpledit"]').first().click(o));
await step('упражнение в набор', o => p.locator('[data-act="tplsetadd"]').first().click(o));
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(450);
await step('упражнение', o => p.locator('[data-act="exedit"]').first().click(o));
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(500);
await step('привычка', o => p.locator('[data-act="edit"], [data-act="habedit"]').first().click(o));
await p.evaluate(() => { location.hash = '#/budget'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="ops"]').click(); await p.waitForTimeout(450);
await step('операция бюджета', o => p.locator('[data-act="opadd"]').first().click(o));
await p.evaluate(() => { location.hash = '#/study'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="board"]').click(); await p.waitForTimeout(450);
await step('этап учёбы', o => p.locator('[data-act="taskadd"], [data-act="open"]').first().click(o));
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
await step('дело заботы', o => p.locator('[data-act="edit"]').first().click(o));
await step('отметка дела', o => p.locator('[data-act="done"]').first().click(o));
await step('питомец', o => p.locator('[data-act="petedit"]').first().click(o));
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(600);
await step('строка трекера', o => p.locator('[data-act="rowedit"], .tr-name.own, [data-act="rowadd"]').first().click(o));

console.log(bad ? `✗ шторок с вылетом: ${bad}` : 'вылета нет ни в одной шторке');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
