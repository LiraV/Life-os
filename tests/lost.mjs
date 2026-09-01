// Данные на устройстве пропали, а отложенная копия рядом осталась. Приложение
// обязано спросить, а не заводить чистый лист молча: человек прочитает пустой
// экран как «всё пропало», а запись поверх отнимет последний шанс.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };

async function open() {
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
  // Настоящая жизнь: имя, цели, привычки.
  await p.evaluate(async () => {
    const { update } = await import('/app/js/store.js');
    update(s => {
      s.ui.tips = 'off';
      s.user.name = 'Лера';
      s.goals.push({ id: 'g1', title: 'Важная цель', horizon: 'month', period: '2026-08', target: 3, current: 1, steps: [], slots: [] });
      s.habits.push({ id: 'h1', name: 'Вода', target: 1, log: {} });
    });
  });
  await p.waitForTimeout(400);
  return { ctx, p };
}
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state') || 'null'));

// ── копия есть: спрашиваем и ничего не пишем ────────────────────
{
  const { ctx, p } = await open();
  await p.evaluate(() => {
    // Как будто браузер очистил сохранение, а отложенная копия уцелела.
    localStorage.setItem('lifeos.state.prev', localStorage.getItem('lifeos.state'));
    localStorage.removeItem('lifeos.state');
    location.reload();
  });
  // Ждём сам экран потери, а не «примерно секунду»: под нагрузкой соседних
  // наборов отрисовка не успевала, и набор падал на полупустой странице.
  await p.waitForFunction(() => /Данные не нашлись/i.test(document.getElementById('scr')?.innerText || ''),
    null, { timeout: 20000 });
  const t = await p.locator('#scr').innerText();
  ok('приложение говорит, что данные не нашлись', /Данные не нашлись/i.test(t), t.slice(0, 60));
  ok('и что копия рядом', /отложенная копия/i.test(t));
  ok('пустое состояние не записано поверх', (await st(p)) === null, JSON.stringify(await st(p))?.slice(0, 40));

  await p.locator('[data-lost="restore"]').click(); await p.waitForTimeout(800);
  const s = await st(p);
  ok('копия вернулась: имя на месте', s?.user?.name === 'Лера', s?.user?.name);
  ok('и цель', s?.goals?.some(g => g.title === 'Важная цель'), String(s?.goals?.length));
  ok('и привычка', s?.habits?.some(h => h.name === 'Вода'), String(s?.habits?.length));
  ok('приложение открылось как обычно', !/Данные не нашлись/i.test(await p.locator('#scr').innerText()));
  await ctx.close();
}

// ── «начать заново»: копию не трогаем ───────────────────────────
{
  const { ctx, p } = await open();
  await p.evaluate(() => {
    localStorage.setItem('lifeos.state.prev', localStorage.getItem('lifeos.state'));
    localStorage.removeItem('lifeos.state');
    location.reload();
  });
  await p.waitForFunction(() => document.querySelector('[data-lost="fresh"]'), null, { timeout: 20000 });
  await p.locator('[data-lost="fresh"]').click(); await p.waitForTimeout(800);
  ok('после «начать заново» приложение работает', !/Данные не нашлись/i.test(await p.locator('#scr').innerText()));
  ok('и копия осталась лежать', await p.evaluate(() => !!localStorage.getItem('lifeos.state.prev')));
  ok('состояние записалось', !!(await st(p)));
  await ctx.close();
}

// ── новый человек: копии нет, вопросов быть не должно ───────────
{
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  ok('новому человеку про потерю не говорят', !/Данные не нашлись/i.test(await p.locator('#scr').innerText()));
  await ctx.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ потерянные данные не подменяются чистым листом');
process.exit(bad ? 1 : 0);
