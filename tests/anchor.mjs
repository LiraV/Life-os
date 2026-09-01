// Открытый день принадлежит устройству, а не облаку. Состояние приходило
// целиком, вместе с якорями — днём, неделей, месяцем, годом, — и экран сам
// уезжал на день, который последним трогали на другом устройстве.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
// Читаем состояние в памяти, а не с диска: запись отложена на 120 мс, и с
// диска мы видели бы прошлый кадр. На диск заглядываем отдельно и с паузой.
const ui = () => p.evaluate(async () => (await import('/app/js/store.js')).S.ui);
const mem = fn => p.evaluate(async f => { const { S } = await import('/app/js/store.js'); return eval(f)(S); }, fn.toString());

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));

// ── чужие якоря не приезжают ────────────────────────────────────
// Ровно то, что приходит с другого устройства: там открыт прошлый месяц.
const away = await p.evaluate(async t => {
  const { adoptState, stateSnapshot } = await import('/app/js/store.js');
  const copy = stateSnapshot();
  copy.ui.date = '2026-08-31';
  copy.ui.weekAnchor = '2026-08-31';
  copy.ui.monthAnchor = '2026-08';
  copy.ui.year = 2025;
  copy.ui.theme = 'sage';          // а вот настройки — общие, они приехать должны
  copy.user.name = 'С ноутбука';
  adoptState(copy);
  return t;
}, today);
let u = await ui();
ok('день остался своим', u.date === away, u.date);
ok('и неделя тоже', u.weekAnchor === away, u.weekAnchor);
ok('и месяц', u.monthAnchor === away.slice(0, 7), u.monthAnchor);
ok('и год', String(u.year) === away.slice(0, 4), String(u.year));
ok('а тема из облака приехала', u.theme === 'sage', u.theme);
ok('и данные тоже', (await mem(S => S.user.name)) === 'С ноутбука', await mem(S => S.user.name));

// ── свой выбор дня переживает приход состояния ──────────────────
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('[data-act="next"]').first().click(); await p.waitForTimeout(400);
await p.locator('[data-act="next"]').first().click(); await p.waitForTimeout(400);
const picked = (await ui()).date;
ok('пролистали вперёд', picked !== today, picked);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.user.xp = (s.user.xp || 0) + 10;
  s.ui.date = '2026-08-31';
  return import('/app/js/store.js').then(m => m.adoptState(s));
});
await p.waitForTimeout(500);
ok('после синхронизации остались там, где стояли', (await ui()).date === picked, (await ui()).date);
ok('а данные из облака приняты', (await mem(S => S.user.xp)) >= 10, String(await mem(S => S.user.xp)));

// ── запуск по-прежнему открывает сегодня ────────────────────────
await p.reload({ waitUntil: 'load' });
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
ok('после перезапуска — сегодня', (await ui()).date === today, (await ui()).date);

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ место на экране принадлежит устройству');
process.exit(bad ? 1 : 0);
