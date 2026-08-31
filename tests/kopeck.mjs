// Копейки не теряются, а итог за месяц позволяет учесть прожитое, не расписывая
// его по операциям.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const norm = x => x.replace(/ /g, ' ');

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(800);

// ── копейки ─────────────────────────────────────────────────────
const show = await p.evaluate(async () => {
  const ui = await import('/app/js/ui.js');
  return [ui.money(1200.5), ui.money(7000), ui.money(0.3), ui.money(41540.07)];
});
ok('копейки показываются, когда они есть', norm(show[0]) === '1 200,50 ₽', show[0]);
ok('а у целых сумм хвоста из нулей нет', norm(show[1]) === '7 000 ₽', show[1]);
ok('мелочь не пропадает', norm(show[2]) === '0,30 ₽', show[2]);

await p.evaluate(() => { location.hash = '#/budget/ops'; }); await p.waitForTimeout(600);
await p.locator('[data-act="opadd"][data-k="income"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="sum"]', '1200,50');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
ok('введённое с копейками так и сохранилось', s.budget.ops.slice(-1)[0].sum === 1200.5,
  String(s.budget.ops.slice(-1)[0].sum));

// Сложение остаётся точным: дробные числа любят давать хвост.
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.budget.ops.push({ id: 'a', kind: 'income', sum: 0.1, date: x.budget.ops[0].date, catId: '' });
  x.budget.ops.push({ id: 'b', kind: 'income', sum: 0.2, date: x.budget.ops[0].date, catId: '' });
  localStorage.setItem('lifeos.state', JSON.stringify(x));
  location.reload();
});
await p.waitForTimeout(800);
const sums = await p.evaluate(async () => {
  const S = await import('/app/js/selectors.js');
  const m = new Date().toISOString().slice(0, 7);
  return { доход: S.sumBy(m, 'income'), остаток: S.balanceAt(m) };
});
ok('сложение не даёт дробного хвоста', String(sums.доход) === '1200.8', String(sums.доход));

// ── итог за месяц ───────────────────────────────────────────────
const m = (await st()).ui.budMonth || new Date().toISOString().slice(0, 7);
await p.evaluate(() => { location.hash = '#/budget/ops'; }); await p.waitForTimeout(500);
await p.locator('[data-act="bulk"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="income"]', '80000');
await p.fill('.sheet input[name="expense"]', '54321,45');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const bulk = s.budget.ops.filter(o => o.bulk);
ok('итог записался двумя строками', bulk.length === 2, JSON.stringify(bulk.map(o => [o.kind, o.sum])));
ok('и датирован последним днём месяца', bulk.every(o => o.date.endsWith('-31') || o.date.endsWith('-30') || o.date.endsWith('-28') || o.date.endsWith('-29')),
  bulk.map(o => o.date).join(', '));
ok('копейки в итоге целы', bulk.some(o => o.sum === 54321.45), JSON.stringify(bulk.map(o => o.sum)));
ok('обычные операции остались', s.budget.ops.filter(o => !o.bulk).length === 3, String(s.budget.ops.filter(o => !o.bulk).length));

// Второе нажатие заменяет, а не удваивает.
await p.locator('[data-act="bulk"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="income"]', '90000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const again = s.budget.ops.filter(o => o.bulk);
ok('повторный итог заменяет прежний, а не складывается',
  again.filter(o => o.kind === 'income').length === 1 && again.find(o => o.kind === 'income').sum === 90000,
  JSON.stringify(again.map(o => [o.kind, o.sum])));

ok('в списке видно, что это итог', /итог/.test(await p.locator('#scr').innerText()));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ копейки целы, итог месяца записывается одной строкой');
process.exit(bad ? 1 : 0);
