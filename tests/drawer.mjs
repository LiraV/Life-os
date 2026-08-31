// Меню выезжает слева — и этот выезд играет один раз. Пока меню пересобиралось
// на каждую перерисовку, анимация начиналась заново: приложение рисуется и от
// синхронизации, и от смены минуты, и от любой правки — открытое меню ездило
// туда-сюда без остановки.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(900);

await p.locator('#nav [data-nav="more"]').click(); await p.waitForTimeout(500);
ok('меню открылось', await p.locator('.drawer').count() === 1);
// Метим сам ящик: пересоздадут — метка исчезнет, и выезд проиграется заново.
await p.evaluate(() => { document.querySelector('.drawer-wrap').dataset.mark = 'то-же'; });
const same = () => p.evaluate(() => document.querySelector('.drawer-wrap')?.dataset.mark === 'то-же');
const anim = () => p.evaluate(() => document.querySelector('.drawer')?.getAnimations?.().length || 0);

for (const [why, act] of [
  ['перерисовки', async () => { const { render } = await import('/app/js/main.js'); render?.(); }],
  ['правки данных', async () => { const { update } = await import('/app/js/store.js'); update(s => { s.user.xp += 1; }); }],
  ['ещё одной правки', async () => { const { update } = await import('/app/js/store.js'); update(s => { s.user.xp += 1; }); }],
]) {
  await p.evaluate(act);
  await p.waitForTimeout(300);
  ok(`меню на месте после ${why}`, await same());
  ok(`и выезд не начинается заново после ${why}`, await anim() === 0, `анимаций: ${await anim()}`);
}

// Содержимое всё же обновляется, когда меняется то, что в нём показано.
const xpBefore = await p.locator('.drawer-head .lab').innerText();
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.user.name = 'Лера'; s.user.xp += 4000; });
});
await p.waitForTimeout(400);
ok('меню осталось тем же ящиком', await same());
ok('но имя в нём обновилось', /Лера/.test(await p.locator('.drawer-head').innerText()), await p.locator('.drawer-head').innerText().then(x => x.replace(/\n/g, ' · ')));
ok('и уровень тоже', (await p.locator('.drawer-head .lab').innerText()) !== xpBefore, `${xpBefore} → ${await p.locator('.drawer-head .lab').innerText()}`);

// Закрытие и открытие — новый ящик и честный выезд. Закрываем тапом по вуали:
// кнопку меню сам ящик и перекрывает.
await p.locator('.drawer-wrap').click({ position: { x: 340, y: 400 } }); await p.waitForTimeout(400);
ok('меню закрылось', await p.locator('.drawer').count() === 0);
await p.locator('#nav [data-nav="more"]').click(); await p.waitForTimeout(120);
ok('открылось заново', await p.locator('.drawer').count() === 1);
ok('и метки на нём уже нет', !(await same()));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ меню стоит на месте');
process.exit(bad ? 1 : 0);
