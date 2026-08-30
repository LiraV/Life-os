// Вода как привычка и вода в «Питании» — одно число.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

// старые данные: привычка про воду в миллилитрах + пустое «Питание»
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.evaluate(() => localStorage.setItem('lifeos.state', JSON.stringify({
  v: 27, onboarded: true, ui: { tips: 'off' },
  habits: [
    { id: 'h1', name: 'Вода 2 литра', target: 2000, step: 250, unit: 'мл', log: { '2026-08-20': 1500 } },
    { id: 'h2', name: 'Таблетки', target: 3, step: 1, unit: 'раз', log: { '2026-08-20': 2 } },
  ],
  food: { targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2200 }, days: {} },
})));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(800);

const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const s1 = await st();
ok('водяная привычка связалась при обновлении', s1.habits[0].link === 'water');
ok('обычная привычка не тронута', s1.habits[1].link === '');
ok('прошлые миллилитры перенесены в «Питание»', s1.food.days['2026-08-20'].water === 1500);
ok('журнал привычки сохранён, а не стёрт', s1.habits[0].log['2026-08-20'] === 1500);

// Обнулённый вручную день не должен воскресать из журнала привычки
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.food.days['2026-08-20'].water = 0; });
});
await p.waitForTimeout(300);
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(800);
ok('обнулённый день не восстановился при перезагрузке', (await st()).food.days['2026-08-20'].water === 0);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.food.days['2026-08-20'].water = 1500; });
});
await p.waitForTimeout(300);

const read = () => p.evaluate(async () => {
  const { habitCount, habitTarget, liveHabits, habitUnit } = await import('./app/js/selectors.js');
  const { todayISO } = await import('./app/js/dates.js');
  const hb = liveHabits()[0];
  return { count: habitCount(hb, todayISO()), target: habitTarget(hb), unit: habitUnit(hb), past: habitCount(hb, '2026-08-20') };
});
const r1 = await read();
ok('норма привычки берётся из «Питания» (2200)', r1.target === 2200);
ok('единица — мл', r1.unit === 'мл');
ok('прошлый день читается через связь', r1.past === 1500);

// наливаем в «Питании» — видно в привычке
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
await p.locator('[data-act="water"][data-v="500"]').click(); await p.waitForTimeout(500);
ok('налили 500 в «Питании» — привычка их видит', (await read()).count === 500);
ok('«Питание» говорит, что число общее', /Ритме/.test(await p.locator('.scr').innerText()));

// тапаем в «Ритме» — видно в питании
await p.evaluate(() => { location.hash = '#/habits'; }); await p.waitForTimeout(700);
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());
const cell = p.locator(`[data-act="tick"][data-id="h1"][data-d="${today}"]`);
await cell.click(); await p.waitForTimeout(500);
const s2 = await st();
ok('тап в «Ритме» долил шаг в «Питание» (750)', s2.food.days[today].water === 750);
ok('привычка своего журнала на сегодня не завела', !s2.habits[0].log[today]);

// норма закрыта — обнуление работает через ту же связь
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => { s.food.days[todayISO()].water = 2200; });
});
await p.waitForTimeout(300);
await cell.click(); await p.waitForTimeout(500);
ok('тап по закрытой норме обнуляет воду в «Питании»', (await st()).food.days[today].water === 0);

// снятие связи возвращает привычку себе
await p.locator('[data-act="edit"][data-id="h1"]').click(); await p.waitForTimeout(500);
ok('в шторке есть переключатель связи', await p.locator('input[name="water"]').count() === 1);
await p.locator('input[name="water"]').uncheck(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
const r2 = await read();
ok('после снятия связи норма снова своя (2000)', r2.target === 2000);
ok('и старый журнал на месте', r2.past === 1500);

// выгрузка видит воду через связь
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.habits[0].link = 'water'; });
});
const dates = await p.evaluate(async () => {
  const { habitDates, liveHabits } = await import('./app/js/selectors.js');
  return habitDates(liveHabits()[0]);
});
ok('дни привычки берутся из «Питания»', dates.includes('2026-08-20'));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
