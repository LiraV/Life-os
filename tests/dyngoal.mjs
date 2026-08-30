// Динамичные цели: связь с намерениями и создание из сферы.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const go = async x => { await p.evaluate(h => { location.hash = h; }, x); await p.waitForTimeout(650); };
const plans = async t => {
  await go('#/plans');
  await p.locator(`[data-act="ptab"][data-v="${t}"], .pill:text-is("${t === 'month' ? 'Месяц' : t === 'year' ? 'Год' : 'Неделя'}")`).first().click();
  await p.waitForTimeout(600);
};
const ym = new Date().toISOString().slice(0, 7);
const y = ym.slice(0, 4);
const q = `${y}-Q${Math.ceil(Number(ym.slice(5, 7)) / 3)}`;

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(([yy, qq, mm]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.intentions = {
    [yy]: [{ id: 'i-year', text: 'Заниматься музыкой' }],
    [qq]: [{ id: 'i-q', text: 'Не выгорать' }],
    [mm]: [{ id: 'i-m', text: 'Двигаться каждый день' }],
  };
  s.lessons = [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, step: 1, log: {}, items: [], cost: 0 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [y, q, ym]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. намерения всех уровней предлагаются месячной цели
const above = await p.evaluate(async m => {
  const sel = await import('./app/js/selectors.js');
  return sel.intentionsAbove(m).map(i => `${i.text}/${i.level}`);
}, ym);
// В месяце намерений нет: они живут на квартале и годе. Написанное раньше
// в месяце переезжает в свой квартал вместе с идентификатором.
ok('намерений месяца в списке нет', !above.some(x => /месяц/.test(x)), above.join(', '));
ok('месячное намерение переехало в квартал', above.some(x => /Двигаться каждый день\/квартал/.test(x)), above.join(', '));
ok('и год на месте', above.some(x => /Заниматься музыкой\/год/.test(x)));
ok('идентификатор сохранился — связи целей не рвутся', await p.evaluate(async () => {
  const { S } = await import('./app/js/store.js');
  return Object.values(S.intentions).flat().some(i => i.id === 'i-m');
}));
ok('месячного ключа в данных не осталось', await p.evaluate(async () => {
  const { S } = await import('./app/js/store.js');
  return !Object.keys(S.intentions).some(k => /^\d{4}-\d{2}$/.test(k));
}));

// ── 2. динамичная цель со связью
await plans('month');
await p.locator('[data-act="dynadd"]').first().click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('в форме есть выбор намерения', await p.locator('.sheet select[name="intentId"]').count() === 1);
ok('сказано, что со счётом плюсов не будет', /плюсов у строки не будет/.test(sheet),
  (sheet.match(/Со счётом[\s\S]{0,60}/) || [''])[0]);
await p.fill('.sheet input[name="title"]', 'Сходить на вокал');
await p.fill('.sheet input[name="target"]', '4');
await p.selectOption('.sheet select[name="intentId"]', 'i-year'); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
let g = s.goals.find(x => x.title === 'Сходить на вокал');
ok('цель динамичная и связана', g.dynamic === true && g.intentId === 'i-year', JSON.stringify({ d: g.dynamic, i: g.intentId }));
let scr = await p.locator('.scr').innerText();
ok('в строке видно, ради чего', /к «Заниматься музыкой»/.test(scr), (scr.match(/Сходить[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' · '));

// ── 3. с другой стороны — под намерением видно цель
await plans('year');
scr = await p.locator('.scr').innerText();
ok('под намерением года перечислено, что к нему ведёт', /к нему ведёт Сходить на вокал/.test(scr),
  (scr.match(/Заниматься музыкой[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' · '));

// ── 4. связь правится в обычной форме цели
await plans('month');
await p.locator('.dyn-row .grow').first().click(); await p.waitForTimeout(500);
ok('в форме цели есть намерение', await p.locator('.sheet select[name="intentId"]').count() === 1);
ok('и стоит прежнее', await p.inputValue('.sheet select[name="intentId"]') === 'i-year');
await p.selectOption('.sheet select[name="intentId"]', 'i-q'); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('связь поменялась', (await st()).goals.find(x => x.title === 'Сходить на вокал').intentId === 'i-q');

// у цели года намерения не спрашивают: намерений выше нет
await p.locator('[data-act="goaladd"]').first().click().catch(() => {});
await p.waitForTimeout(400);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// ── 5. динамичная цель из сферы
await go('#/edu');
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
ok('пока срок «год» — блока месяца нет', await p.locator('.sheet input[name="dynamic"]').count() === 0);
// счётов у обучения теперь несколько — выбираем нужный явно
await p.selectOption('.sheet select[name="kind"]', 'lessons'); await p.waitForTimeout(400);
await p.locator('.sheet .opts[data-name="horizon"] .opt[data-value="month"]').click(); await p.waitForTimeout(400);
ok('на месяце появился выбор «показывать в месяце»', await p.locator('.sheet input[name="dynamic"]').count() === 1);
ok('и выбор намерения', await p.locator('.sheet select[name="intentId"]').count() === 1);
await p.locator('.sheet input[name="dynamic"]').check();
await p.selectOption('.sheet select[name="intentId"]', 'i-q');
await p.fill('.sheet input[name="target"]', '5');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
g = s.goals.find(x => x.src?.kind === 'lessons');
ok('цель из сферы стала динамичной', g && g.dynamic === true, JSON.stringify({ d: g?.dynamic, h: g?.horizon }));
ok('и связана с намерением квартала', g.intentId === 'i-q', g.intentId);
ok('счёт остался автоматическим', !!g.src, JSON.stringify(g.src));

await plans('month');
scr = await p.locator('.scr').innerText();
ok('она видна в месячном блоке', /Занятий с полки/.test(scr), (scr.match(/ДИНАМИЧ[\s\S]{0,90}/i) || [''])[0].replace(/\n/g, ' · '));
ok('намерений в месяце нет', !/НАМЕРЕНИЯ/i.test(scr));
ok('и подписана «сама»', /· сама/.test(scr));
ok('плюсов у неё нет — считает сфера', await p.locator('.dyn-row', { hasText: 'Занятий с полки' }).locator('.hab-plus').count() === 0);

// ── 6. галочка не тронута — цель обычная
await go('#/edu');
await p.locator('[data-act="spheregoal"]').first().click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', 'lessons'); await p.waitForTimeout(400);
await p.locator('.sheet .opts[data-name="horizon"] .opt[data-value="quarter"]').click(); await p.waitForTimeout(400);
ok('в квартале блока месяца нет', await p.locator('.sheet input[name="dynamic"]').count() === 0);
await p.fill('.sheet input[name="target"]', '9');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const q2 = (await st()).goals.find(x => x.horizon === 'quarter' && x.src);
ok('квартальная цель не динамичная', q2 && !q2.dynamic, JSON.stringify({ d: q2?.dynamic }));
ok('и без намерения', !q2.intentId, JSON.stringify(q2.intentId));

// ── 7. старые цели живы
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 48, onboarded: true, user: { name: 'Старая', chronotype: 'сова' },
    goals: [{ id: 'g1', title: 'Старая цель', horizon: 'month', period: '2026-08', target: 3, current: 1 }] }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('старой цели добавилось пустое поле связи', s.goals[0].intentId === '', JSON.stringify(s.goals[0].intentId));
ok('и её числа целы', s.goals[0].target === 3 && s.goals[0].current === 1);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
