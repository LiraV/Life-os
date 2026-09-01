// Динамичная цель может брать число из привычки, занятия или сферы.
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
const plans = async t => {
  await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(600);
  await p.locator(`.pill:text-is("${t}")`).first().click(); await p.waitForTimeout(600);
};
const ym = new Date().toISOString().slice(0, 7);
// Дни берём внутри текущего месяца, а не «вчера и позавчера»: цели считают за
// месяц, и первого числа вчерашний день лежит уже в прошлом — проверка,
// написанная от «сегодня», разваливалась ровно раз в месяц.
const day = n => `${ym}-${String(n).padStart(2, '0')}`;

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(days => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.habits = [{ id: 'h1', name: 'Зубы', target: 2, step: 1, unit: '', link: '', log: {}, createdAt: days[3] }];
  days.slice(0, 3).forEach(d => { s.habits[0].log[d] = 2; });
  s.lessons = [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, step: 1, log: {}, items: [], cost: 0 }];
  s.lessons[0].log[days[0]] = 1; s.lessons[0].log[days[1]] = 1;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, [day(1), day(2), day(3), day(1)]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. список источников
const able = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.countableFor('month').map(x => `${x.group} · ${x.name}`);
});
console.log(' ', able.join(' | '));
ok('в списке есть привычки', able.some(x => /Ритм дня · Дней с привычкой/.test(x)), able.filter(x => /Ритм/.test(x)).join(', '));
ok('и занятия с полки', able.some(x => /Занятий с полки/.test(x)));
ok('и деньги из бюджета', able.some(x => /Заработано/.test(x)));
ok('годовые счёты сюда не лезут', !able.some(x => /Стран за год/.test(x)), able.filter(x => /Стран/.test(x)).join(', '));

// ── 2. цель от привычки
await plans('Месяц');
await p.locator('[data-act="dynadd"]').first().click(); await p.waitForTimeout(500);
ok('в форме есть выбор источника', await p.locator('.sheet select[name="kind"]').count() === 1);
ok('по умолчанию — отмечаю сама', await p.inputValue('.sheet select[name="kind"]') === '');
ok('уточнения пока нет', await p.locator('.sheet select[name="ref"]').count() === 0);
await p.fill('.sheet input[name="title"]', 'Чистить зубы дважды');
await p.selectOption('.sheet select[name="kind"]', 'habit'); await p.waitForTimeout(400);
ok('появилось уточнение', await p.locator('.sheet select[name="ref"]').count() === 1);
ok('и в нём привычка', /Зубы/.test(await p.locator('.sheet select[name="ref"]').innerText()));
await p.fill('.sheet input[name="target"]', '20');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let s = await st();
let g = s.goals.find(x => x.title === 'Чистить зубы дважды');
ok('цель динамичная и со счётом', g.dynamic === true && g.src?.kind === 'habit', JSON.stringify(g.src));
ok('уточнение — та самая привычка', g.src.ref === 'h1');
ok('единица взята у счёта', g.unit === 'дней', g.unit);
let scr = await p.locator('.scr').innerText();
ok('в строке число из привычки', /3 \/ 20 дней/.test(scr), (scr.match(/Чистить[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' · '));
ok('и подпись «сама»', /· сама/.test(scr));
ok('плюсов у неё нет', await p.locator('.dyn-row', { hasText: 'Чистить зубы' }).locator('.hab-plus').count() === 0);

// ── 3. отметка привычки двигает цель
await p.evaluate(([d, hid]) => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.habits.find(h => h.id === hid).log[d] = 2;
  localStorage.setItem('lifeos.state', JSON.stringify(x));
}, [day(4), 'h1']);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800); await plans('Месяц');
ok('новая отметка сразу в цели', /4 \/ 20 дней/.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).match(/Чистить[\s\S]{0,30}/)?.[0]?.replace(/\n/g, ' · '));

// ── 4. ручную цель можно подвязать потом
await p.locator('[data-act="dynadd"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="title"]', 'Сходить на вокал');
await p.fill('.sheet input[name="target"]', '4');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
g = s.goals.find(x => x.title === 'Сходить на вокал');
ok('ручная цель без источника', !g.src, JSON.stringify(g.src));
ok('у неё есть плюс', await p.locator('.dyn-row', { hasText: 'Сходить на вокал' }).locator('.hab-plus').count() >= 1);

await p.locator('.dyn-row', { hasText: 'Сходить на вокал' }).locator('.grow').click(); await p.waitForTimeout(500);
ok('в форме цели есть «Откуда число»', await p.locator('.sheet select[name="kind"]').count() === 1);
await p.selectOption('.sheet select[name="kind"]', 'lessons'); await p.waitForTimeout(400);
ok('уточнение подтянулось', /Вокал/.test(await p.locator('.sheet select[name="ref"]').innerText()));
await p.selectOption('.sheet select[name="ref"]', 'l1'); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
g = s.goals.find(x => x.title === 'Сходить на вокал');
ok('цель подвязалась к занятию', g.src?.kind === 'lessons' && g.src.ref === 'l1', JSON.stringify(g.src));
scr = await p.locator('.scr').innerText();
ok('число пришло с полки', /2 \/ 4 занятий/.test(scr), (scr.match(/Сходить[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' · '));
ok('плюс исчез', await p.locator('.dyn-row', { hasText: 'Сходить на вокал' }).locator('.hab-plus').count() === 0);

// ── 5. связь можно снять обратно
await p.locator('.dyn-row', { hasText: 'Сходить на вокал' }).locator('.grow').click(); await p.waitForTimeout(500);
await p.selectOption('.sheet select[name="kind"]', ''); await p.waitForTimeout(400);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
g = s.goals.find(x => x.title === 'Сходить на вокал');
ok('источник снялся', !g.src, JSON.stringify(g.src));
ok('и плюс вернулся', await p.locator('.dyn-row', { hasText: 'Сходить на вокал' }).locator('.hab-plus').count() >= 1);

// ── 6. счёт совпадает с трекером
const same = await p.evaluate(async m => {
  const sel = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const hb = S.habits[0];
  return { tracker: sel.habitMonthCount(hb, m), goal: sel.autoCount(S.goals.find(g2 => g2.src?.kind === 'habit')) };
}, ym);
ok('строка трекера и цель дают одно число', same.tracker === same.goal, JSON.stringify(same));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
