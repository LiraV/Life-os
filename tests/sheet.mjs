// Шторка не должна прыгать. Списки, из которых берут подсказки по одной,
// раньше делали это через «закрыть и открыть заново»: на телефоне шторка на
// каждый тап уезжала вниз и приезжала обратно — «переоткрывается всё время».
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

// Метим открытую шторку: если её пересоздали, метка исчезнет.
const mark = () => p.evaluate(() => { document.querySelector('.overlay').dataset.mark = 'та-же'; });
const same = () => p.evaluate(() => document.querySelector('.overlay')?.dataset.mark === 'та-же');

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(900);

// ── шаги и показатели в «Моём деле» ─────────────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.biz.projects = [{ id: 'p1', name: 'Клуб', kind: 'community', stage: 'build', steps: [], metrics: [], marks: [] }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.hash = '#/biz/p1';
  location.reload();
});
await p.waitForTimeout(900);
await p.click('[data-act="steps"]'); await p.waitForTimeout(500);
await mark();
const before = await p.locator('.sheet [data-act="stepadd"]').count();
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(400);
ok('шторка шагов та же самая', await same());
ok('взятый шаг ушёл из подсказок', await p.locator('.sheet [data-act="stepadd"]').count() === before - 1,
  `${before} → ${await p.locator('.sheet [data-act="stepadd"]').count()}`);
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(400);
ok('и после второго тапа та же', await same());
ok('два шага записались', (await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).biz.projects[0].steps.length)) === 2);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

await p.click('[data-act="metrics"]'); await p.waitForTimeout(500);
await mark();
await p.locator('.sheet [data-act="madd"]').first().click(); await p.waitForTimeout(400);
ok('шторка показателей та же самая', await same());
ok('показатель добавился', (await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).biz.projects[0].metrics.length)) === 1);
await p.locator('.sheet [data-act="mdel"]').first().click(); await p.waitForTimeout(400);
ok('и удаление не пересоздаёт шторку', await same());
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── свои мерки в «Теле» ─────────────────────────────────────────
await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(700);
const mt = p.locator('[data-act="metrics"]');
if (await mt.count()) {
  await mt.first().click(); await p.waitForTimeout(500);
  await mark();
  await p.locator('.sheet [data-act="mtadd"]').first().click(); await p.waitForTimeout(400);
  ok('шторка мерок та же самая', await same());
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
} else ok('шторка мерок открылась', false, 'кнопки нет');

// ── шторка переживает фоновое обновление ────────────────────────
await p.evaluate(() => { location.hash = '#/biz/p1'; }); await p.waitForTimeout(600);
await p.click('[data-act="steps"]'); await p.waitForTimeout(500);
await mark();
await p.evaluate(async () => { const { update } = await import('/app/js/store.js'); update(s => { s.user.xp += 1; }); });
await p.waitForTimeout(500);
ok('фоновое обновление не закрывает шторку', await same());

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ шторка стоит на месте');
process.exit(bad ? 1 : 0);
