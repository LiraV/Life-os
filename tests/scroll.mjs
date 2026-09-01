// Прокрутка внутри экрана переживает перерисовку. Доска работы, отлистанная
// до правых колонок, отматывалась в начало при каждом обновлении: перерисовка
// собирает экран заново, а о прокрутке внутри него никто не заботился.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const left = () => p.evaluate(() => Math.round(document.querySelector('.kb-cols')?.scrollLeft ?? -1));
const bump = () => p.evaluate(async () => { const { update } = await import('/app/js/store.js'); update(s => { s.user.xp += 1; }); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.ui.workTab = 'board';
  s.work.jobs = [{ id: 'j1', name: 'Студия', start: '2026-01-01', norm: 8, days: [1, 2, 3, 4, 5] }];
  s.work.tasks = [];
  for (let i = 0; i < 6; i++) s.work.tasks.push({ id: 't' + i, title: 'Задача ' + i, jobId: 'j1', column: 'l1' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.evaluate(() => { location.hash = '#/work/board'; });
await p.waitForFunction(() => document.querySelector('.kb-cols'), null, { timeout: 20000 });
await p.waitForTimeout(400);

// ── листаем доску вбок ──────────────────────────────────────────
ok('доска на месте и её есть куда листать', await p.evaluate(() => {
  const el = document.querySelector('.kb-cols');
  return el.scrollWidth > el.clientWidth + 50;
}));
await p.evaluate(() => { document.querySelector('.kb-cols').scrollLeft = 400; });
await p.waitForTimeout(250);
const was = await left();
ok('отлистали вправо', was > 300, String(was));

// ── чужая перерисовка не отматывает её назад ────────────────────
await bump();
await p.waitForTimeout(400);
ok('после перерисовки доска осталась там же', await left() === was, `${was} → ${await left()}`);
await bump(); await bump();
await p.waitForTimeout(400);
ok('и после ещё двух — тоже', await left() === was, `${was} → ${await left()}`);

// ── прокрутка внутри колонки тоже держится ──────────────────────
const colTop = await p.evaluate(() => {
  const body = document.querySelector('.kb-body');
  if (!body) return -1;
  body.scrollTop = 60;
  return Math.round(body.scrollTop);
});
if (colTop > 0) {
  await bump(); await p.waitForTimeout(400);
  ok('колонка не отматывается вверх',
    await p.evaluate(() => Math.round(document.querySelector('.kb-body').scrollTop)) === colTop,
    String(colTop));
} else ok('колонка не прокручивалась — нечего держать', true);

// ── а уход на другой экран прокрутку не тащит ───────────────────
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.evaluate(() => { location.hash = '#/work/board'; });
await p.waitForFunction(() => document.querySelector('.kb-cols'), null, { timeout: 20000 });
await p.waitForTimeout(400);
ok('вернулись — доска с начала', await left() === 0, String(await left()));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ доска не отматывается сама');
process.exit(bad ? 1 : 0);
