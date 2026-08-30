// Поиск страны: клавиатура не закрывается, совпадения с начала — первыми.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/trips'; }); await p.waitForTimeout(600);
await p.locator("[data-act=\"tab\"][data-v=\"add\"]").first().click(); await p.waitForTimeout(500);

const inp = p.locator('input[data-act-input="search"]');
ok('поле поиска на месте', await inp.count() === 1);

// ── 1. фокус не теряется при вводе
await inp.click();
await p.keyboard.type('т', { delay: 60 });
await p.waitForTimeout(350);
ok('после первой буквы фокус остался в поле',
  await p.evaluate(() => document.activeElement?.dataset?.actInput === 'search'),
  await p.evaluate(() => document.activeElement?.tagName + '/' + (document.activeElement?.dataset?.actInput || '—')));
await p.keyboard.type('ур', { delay: 60 });
await p.waitForTimeout(350);
ok('и после третьей тоже', await p.evaluate(() => document.activeElement?.dataset?.actInput === 'search'));
ok('в поле всё, что напечатано', await inp.inputValue() === 'тур', await inp.inputValue());
ok('само поле не пересоздавалось', await p.evaluate(() => {
  const el = document.querySelector('input[data-act-input="search"]');
  if (!window.__seen) { window.__seen = el; return true; }
  return window.__seen === el;
}));

// ── 2. совпадения с начала идут первыми
let names = await p.locator('#cn_found .link-row .ink').allInnerTexts();
// Туркмения и Турция обе начинаются на «тур» — порядок между ними алфавитный
ok('на «тур» сверху страны на «Тур»', /Тур/.test(names[0] || '') && /Тур/.test(names[1] || ''), names.slice(0, 3).join(' · '));

await inp.fill('');
await p.keyboard.type('т', { delay: 40 });
await p.waitForTimeout(350);
names = await p.locator('#cn_found .link-row .ink').allInnerTexts();
const firstFew = names.slice(0, 4).join(' · ');
ok('на «т» сверху страны на «Т», а не Австрия',
  names.slice(0, 4).every(n => /\sТ/.test(n) || /^..?\s?Т/.test(n.replace(/^\S+\s/, 'X '))), firstFew);
ok('середина слова тоже находится', (await p.evaluate(async () => {
  const { searchCountries } = await import('./app/js/countries.js');
  return searchCountries('бри').map(c => c.name);
})).includes('Великобритания'));

// ── 3. выбор всё ещё работает
await inp.fill('');
await p.keyboard.type('исланд', { delay: 30 });
await p.waitForTimeout(400);
await p.locator('#cn_found .link-row').first().click(); await p.waitForTimeout(600);
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
ok('страна отметилась', st.travel.visits.length === 1, JSON.stringify(st.travel.visits[0] || {}));
ok('поиск сохранился в состоянии', typeof st.ui.tripSearch === 'string');

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
