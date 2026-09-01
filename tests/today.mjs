// «День» открывается на сегодня. Открытый день — вещь на сеанс: он сохранялся
// вместе со всем остальным, и человек, распланировавший неделю вперёд, каждый
// раз попадал на последний день, который трогал.
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

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(900);
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
const plus5 = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10); });

// ── планируем вперёд: экран остаётся на сегодня ─────────────────
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
await p.getByText('+ Добавить квест').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="title"]', 'Дело на пятницу');
await p.fill('.sheet input[name="date"]', plus5);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
ok('квест лёг на выбранный день', (s.quests[plus5] || []).some(q => q.title === 'Дело на пятницу'),
  JSON.stringify(Object.keys(s.quests)));
ok('а экран остался на сегодня', s.ui.date === today, s.ui.date);
ok('и в шапке по-прежнему сегодня', /Сегодня/i.test(await p.locator('#scr').innerText()),
  (await p.locator('#scr').innerText()).split('\n').slice(0, 3).join(' · '));

// ── листать дни по-прежнему можно ───────────────────────────────
await p.locator('[data-act="next"]').first().click(); await p.waitForTimeout(500);
s = await st();
ok('вперёд листается', s.ui.date !== today, s.ui.date);
const moved = s.ui.date;
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500);
ok('и в пределах сеанса день держится', (await st()).ui.date === moved, (await st()).ui.date);

// ── а после перезапуска — снова сегодня ─────────────────────────
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1000);
ok('после перезапуска экран на сегодня', (await st()).ui.date === today, (await st()).ui.date);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
ok('и это видно в шапке', /Сегодня/i.test(await p.locator('#scr').innerText()),
  (await p.locator('#scr').innerText()).split('\n').slice(0, 3).join(' · '));
ok('запланированное на будущее никуда не делось',
  ((await st()).quests[plus5] || []).some(q => q.title === 'Дело на пятницу'));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ день открывается на сегодня');
process.exit(bad ? 1 : 0);
