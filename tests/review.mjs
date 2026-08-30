// Недельный анализ состояния: анкета, ряды и строка трекера.
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
const scr = () => p.locator('.scr').innerText();
const week = async () => { await p.evaluate(() => { location.hash = '#/inside/week'; }); await p.waitForTimeout(650); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. вкладка на месте
await p.evaluate(() => { location.hash = '#/inside'; }); await p.waitForTimeout(650);
ok('во «Внутри» появилась «Неделя»', await p.locator('[data-act="tab"][data-v="week"]').count() === 1);
await week();
let t = await scr();
ok('анкета описана', /Восемь вопросов/.test(t));
ok('сказано, что пропуск не ноль', /не считается нулём/.test(t));
ok('пустых рядов пока нет', !/По вопросам/i.test(t));

// ── 2. заполняем неделю
await p.locator('[data-act="rev"]').first().click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('восемь вопросов по шкале', await p.locator('.sheet .opts').count() === 8,
  String(await p.locator('.sheet .opts').count()));
ok('и три открытых', await p.locator('.sheet textarea').count() === 3);
ok('шкала объяснена', /1 — «совсем нет», 5 — «да, вполне»/.test(sheet), (sheet.match(/Шкала.{0,60}/) || [''])[0]);
ok('открытые вопросы отделены заголовком', /Своими словами/i.test(sheet));
ok('сказано, что они никуда не считаются', /никуда не считаются/.test(sheet));
ok('сказано, что пустое поле — не ноль', /не ноль/.test(sheet));

// одна пустая, остальные заполнены: 5,4,4,3,3,4,4 → среднее 3.9
const vals = ['5', '4', '4', '3', '3', '4', '4'];
for (let i = 0; i < vals.length; i++) {
  await p.locator('.sheet .opts').nth(i).locator(`.opt[data-value="${vals[i]}"]`).click();
  await p.waitForTimeout(90);
}
await p.locator('.sheet textarea').first().fill('дедлайн на работе');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let s = await st();
const wk = Object.keys(s.review)[0];
ok('неделя записалась', !!wk && /^\d{4}-W\d{2}$/.test(wk), wk);
ok('незаполненный вопрос остался пустым', Object.keys(s.review[wk].scores).length === 7,
  JSON.stringify(s.review[wk].scores));
ok('открытый ответ сохранён', s.review[wk].open.drain === 'дедлайн на работе');
ok('в дневнике появилась запись', s.diary.some(d => /анализ недели/.test(d.text)));

t = await scr();
ok('средний балл — 3,9', /3,9 из 5/.test(t), (t.match(/.{0,20}из 5/) || [''])[0]);
ok('появился разбор по вопросам', /По вопросам/i.test(t));
ok('просевшее сверху', t.indexOf('Настроение') < t.indexOf('Сон') || t.indexOf('Спокойствие') < t.indexOf('Сон'),
  t.match(/ПО ВОПРОСАМ[\s\S]{0,90}/i)?.[0]?.replace(/\n/g, ' · '));
ok('и это не приговор', /не приговор и не задача/.test(t));

// написанное словами возвращается на экран
ok('ответ своими словами виден на экране', /дедлайн на работе/.test(t), (t.match(/Своими словами[\s\S]{0,80}/i) || [''])[0].replace(/\n/g, ' · '));
ok('и подписан вопросом', /что забрало силы/i.test(t));

// ── 3. счёт напрямую
const calc = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const wk2 = Object.keys(S.review)[0];
  return { score: m.reviewScoreOf(wk2), weeks: m.reviewWeeks().length, monday: m.mondayOf(wk2),
    month: m.reviewMonth(m.mondayOf(wk2).slice(0, 7)) };
});
console.log(' ', JSON.stringify(calc));
ok('средний балл считается по заполненным', calc.score === 3.9, String(calc.score));
ok('понедельник недели вычисляется', /^\d{4}-\d{2}-\d{2}$/.test(calc.monday), calc.monday);
ok('месяц берёт среднее по своим неделям', calc.month === 3.9, String(calc.month));

// ── 4. вторая неделя и ряд
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  const prev = Object.keys(x.review)[0].replace(/W(\d+)/, (_, n) => 'W' + String(Number(n) - 1).padStart(2, '0'));
  x.review[prev] = { date: '2026-08-20', scores: { sleep: 2, energy: 2, body: 3, mood: 2, calm: 2, people: 3, work: 3, sense: 3 }, open: {} };
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800); await week();
t = await scr();
ok('в графике две недели', await p.locator('.spark i').count() === 2, String(await p.locator('.spark i').count()));
ok('прошлые недели перечислены', /Прошлые недели/i.test(t));
ok('у каждой свой балл', /2,5 из 5/.test(t), (t.match(/ПРОШЛЫЕ НЕДЕЛИ[\s\S]{0,60}/i) || [''])[0].replace(/\n/g, ' · '));

// ── 5. строка трекера
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
const row = (await p.locator('.tr tbody tr').filter({ hasText: 'Анализ состояния' }).first().innerText()).replace(/\s+/g, ' ');
ok('строка трекера появилась', /Анализ состояния/.test(row), row);
ok('в ней среднее, а не сумма', !/\b\d{2,}\b/.test(row.replace(/из 5/g, '')), row);

// пустой месяц не считается нулём
const mm = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { empty: m.reviewMonth('2026-01'), now: m.reviewMonth(new Date().toISOString().slice(0, 7)) };
});
ok('месяц без анкет пустой, а не нулевой', mm.empty === null, JSON.stringify(mm));

// ── 6. правка и стирание
await week();
await p.locator('[data-act="rev"]').first().click(); await p.waitForTimeout(500);
ok('прежние ответы подставлены', await p.locator('.sheet .opt.on').count() === 7,
  String(await p.locator('.sheet .opt.on').count()));
ok('есть кнопка стереть', await p.locator('[data-sheet="danger"]').count() === 1);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(600);
ok('неделя стёрлась, вторая осталась', Object.keys((await st()).review).length === 1,
  JSON.stringify(Object.keys((await st()).review)));

// ── 7. старые данные
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 47, onboarded: true, user: { name: 'Старая', chronotype: 'сова' },
    review: { 'плохой-ключ': { scores: { sleep: 9 } }, '2026-W30': { scores: { sleep: 4, mood: 0 }, open: { drain: '  ' } } } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('битый ключ выброшен', !('плохой-ключ' in s.review), JSON.stringify(Object.keys(s.review)));
ok('число вне шкалы не сохранилось', s.review['2026-W30'].scores.mood === undefined,
  JSON.stringify(s.review['2026-W30'].scores));
ok('пустой открытый ответ не сохранился', Object.keys(s.review['2026-W30'].open).length === 0);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
