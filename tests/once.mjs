// Разовое занятие: один день, а не правило на каждую неделю.
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
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.lessons = [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, step: 1, log: {}, items: [], cost: 0 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);

// ── 1. в расписании две кнопки
ok('есть «+ по дням»', await p.locator('[data-act="schedadd"]').count() >= 1);
ok('есть «+ разово»', await p.locator('[data-act="schedonce"]').count() >= 1);
ok('пустое расписание объясняет разницу', /разово.*одно занятие на конкретный день/s.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).match(/Пусто[^]{0,160}/)?.[0]?.replace(/\n/g, ' '));

// ── 2. разовое заводится на день
await p.locator('[data-act="schedonce"]').first().click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('заголовок про разовое', /Разовое занятие/.test(sheet), sheet.split('\n')[0]);
ok('спрашивают число, а не дни недели', await p.locator('.sheet input[name="date"]').count() === 1
  && await p.locator('.sheet .day-box').count() === 0);
ok('повторения у разового нет', await p.locator('.sheet .opts[data-name="every"]').count() === 0);
const day = iso(3);
await p.fill('.sheet input[name="date"]', day);
await p.fill('.sheet input[name="time"]', '18:30');
await p.fill('.sheet input[name="dur"]', '90');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let s = await st();
const sc = s.schedules[0];
ok('правило сохранилось разовым', sc && sc.date === day && (sc.days || []).length === 0, JSON.stringify(sc && { date: sc.date, days: sc.days }));
ok('в списке читается датой и временем', /18:30/.test(await p.locator('.scr').innerText()));

// ── 3. появляется только в свой день
const hits = await p.evaluate(async ([d0, d1, d2]) => {
  const m = await import('./app/js/selectors.js');
  return { own: m.scheduleOn(d0).length, before: m.scheduleOn(d1).length, weekLater: m.scheduleOn(d2).length };
}, [day, iso(2), iso(10)]);
ok('в свой день есть', hits.own === 1, JSON.stringify(hits));
ok('накануне нет', hits.before === 0);
ok('через неделю не повторяется', hits.weekLater === 0, JSON.stringify(hits));

// ── 4. считается в месяце ровно раз
const cnt = await p.evaluate(async ym => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  return m.scheduleMonthCount(S.schedules[0], ym);
}, day.slice(0, 7));
ok('в своём месяце считается один раз', cnt === 1, String(cnt));

// ── 5. видно на «Дне» и отмечается
await p.evaluate(d => { const x = JSON.parse(localStorage.getItem('lifeos.state')); x.ui.date = d; localStorage.setItem('lifeos.state', JSON.stringify(x)); }, day);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
ok('разовое занятие видно в дне', /Вокал/.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).match(/Вокал.{0,30}/)?.[0]);

// ── 6. правило по дням по-прежнему работает
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="schedadd"]').first().click(); await p.waitForTimeout(500);
ok('в правиле спрашивают дни недели', await p.locator('.sheet .day-box').count() === 7);
ok('и повторение', await p.locator('.sheet .opts[data-name="every"]').count() === 1);
await p.locator('.sheet .day-box').nth(5).locator('span').click();
await p.fill('.sheet input[name="time"]', '17:00');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('правило завелось отдельно от разового', s.schedules.length === 2 && s.schedules.some(x => (x.days || []).length === 1),
  JSON.stringify(s.schedules.map(x => x.date || x.days)));
const weekly = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const rule = S.schedules.find(x => !x.date);
  const ym = new Date().toISOString().slice(0, 7);
  return m.scheduleMonthCount(rule, ym);
});
ok('еженедельное правило считает свои дни', weekly >= 4, String(weekly));

// ── 7. старые правила не поехали
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 43, onboarded: true,
    user: { name: 'Старая', chronotype: 'сова' },
    lessons: [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, log: {}, items: [] }],
    schedules: [{ id: 'sc1', kind: 'lesson', refId: 'l1', days: [5], time: '17:00', dur: 60, every: 1 }] }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('старое правило осталось правилом', s.schedules[0].days.join() === '5' && s.schedules[0].date === '',
  JSON.stringify({ days: s.schedules[0].days, date: s.schedules[0].date }));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
