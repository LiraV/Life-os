// Планшет. В портрете iPad приложение съёживалось в телефонную рамку посреди
// экрана: правило «рамка при широком и высоком окне» писалось для браузера на
// компьютере и ловило планшет. Теперь у планшета свой режим: экран целиком,
// навигация снизу, карточки в две колонки, а строка всё же не во всю ширину.
import { chromium } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };

const open = async (w, h, touch = true) => {
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU',
    viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: touch, hasTouch: touch });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`PAGEERROR ${w}×${h}: ${e.message}`));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lifeos.state'));
    s.ui.tips = 'off';
    const t = new Date().toISOString().slice(0, 10);
    s.quests[t] = [{ id: 'q1', title: 'Черновик главы 2', time: '10:00', minutes: 90, sphere: 'study', done: false },
                   { id: 'q2', title: 'Тренировка', time: '18:00', minutes: 60, sphere: 'sport', done: false }];
    localStorage.setItem('lifeos.state', JSON.stringify(s));
    location.reload();
  });
  // Ждём готовности, а не «примерно секунду»: класс режима ставится при первой
  // отрисовке, и под нагрузкой от соседних наборов она не успевала.
  await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
  await p.waitForTimeout(250);
  return { ctx, p };
};
const box = (p, sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
}, sel);

// ── iPad в портрете: свой режим ─────────────────────────────────
{
  const { ctx, p } = await open(834, 1194);
  ok('портрет — планшетный режим', /\bpad\b/.test(await p.evaluate(() => document.querySelector('.app').className)),
    await p.evaluate(() => document.querySelector('.app').className));
  const app = await box(p, '.app');
  ok('приложение во всю ширину, а не телефонной рамкой', app.w === 834, JSON.stringify(app));
  ok('и во всю высоту', app.h >= 1150, String(app.h));
  ok('рамки телефона нет', await p.evaluate(() => getComputedStyle(document.querySelector('.app')).borderRadius) === '0px');

  await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
  const scr = await box(p, '.scr');
  ok('но строка не во всю ширину планшета', scr.w <= 780 && scr.w >= 600, String(scr.w));
  ok('и она по центру', scr.x > 20, String(scr.x));
  ok('карточки в две колонки', await p.evaluate(() =>
    getComputedStyle(document.querySelector('.scr')).gridTemplateColumns.split(' ').length) === 2,
    await p.evaluate(() => getComputedStyle(document.querySelector('.scr')).gridTemplateColumns));
  // Квест — перечисление: читать его слева направо неправильно.
  const q = await box(p, '.quest');
  ok('а квесты — во всю строку', q.w > scr.w * 0.9, `${q.w} из ${scr.w}`);
  ok('навигация осталась снизу, а не сбоку', await p.evaluate(() => {
    const n = document.querySelector('#nav').getBoundingClientRect();
    return n.top > innerHeight * 0.7;
  }));
  ok('вбок ничего не уезжает', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.screenshot({ path: 'pad-portrait.png' });

  // Шторка — окно по центру, а не полоса во всю ширину.
  await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(700);
  const sheet = await box(p, '.sheet');
  ok('шторка — окно по центру', sheet.w <= 580 && sheet.x > 60, JSON.stringify(sheet));
  await p.screenshot({ path: 'pad-sheet.png' });
  await ctx.close();
}

// ── iPad mini тоже планшет ──────────────────────────────────────
{
  const { ctx, p } = await open(744, 1133);
  ok('mini — тоже планшетный режим', /\bpad\b/.test(await p.evaluate(() => document.querySelector('.app').className)));
  ok('и он во всю ширину', (await box(p, '.app')).w === 744);
  await ctx.close();
}

// ── альбом: боковое меню, как на ноутбуке ───────────────────────
{
  const { ctx, p } = await open(1194, 834);
  ok('альбом — режим ноутбука', /\bdesk\b/.test(await p.evaluate(() => document.querySelector('.app').className)));
  ok('меню ушло в колонку слева', await p.evaluate(() => {
    const n = document.querySelector('#nav').getBoundingClientRect();
    return n.left < 60 && n.height > innerHeight * 0.7;
  }));
  await p.screenshot({ path: 'pad-landscape.png' });
  await ctx.close();
}

// ── телефон не изменился ────────────────────────────────────────
{
  const { ctx, p } = await open(390, 844);
  const cls = await p.evaluate(() => document.querySelector('.app').className);
  ok('телефон — ни планшет, ни ноутбук', !/\bpad\b|\bdesk\b/.test(cls), cls);
  await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
  ok('и раскладка у него в одну колонку', await p.evaluate(() =>
    getComputedStyle(document.querySelector('.scr')).display) === 'flex');
  ok('вбок ничего не уезжает', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
}

// ── узкое окно на большом экране: рамка телефона на месте ───────
{
  const { ctx, p } = await open(580, 1000, false);
  const app = await box(p, '.app');
  ok('в узком окне остаётся телефонная рамка', app.w <= 400 && app.h === 830, JSON.stringify(app));
  await ctx.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ планшет разложился по-своему');
process.exit(bad ? 1 : 0);
