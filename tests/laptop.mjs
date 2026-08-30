// Раскладка под ноутбук: боковая навигация, две колонки, широкие экраны.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

const start = async (viewport) => {
  const ctx = await b.newContext(viewport ? { viewport, locale: 'ru-RU' } : { ...devices['iPhone 13'], locale: 'ru-RU' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
  await p.evaluate(async () => {
    const { update, uid } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    const { todayISO } = await import('./app/js/dates.js');
    update(s => {
      s.ui.tips = 'off';
      s.quests[todayISO()] = ['Первый', 'Второй', 'Третий'].map(t =>
        ({ id: uid(), title: t, time: '', minutes: 45, sphere: '', boss: false, done: false }));
    });
    closeSheet();
  });
  return p;
};

// ── онбординг — тоже экран, и он должен быть широким
const ob = await (await b.newContext({ serviceWorkers: 'block',  viewport: { width: 1512, height: 900 }, locale: 'ru-RU' })).newPage();
ob.on('pageerror', e => errs.push(e.message));
await ob.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ob.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await ob.waitForTimeout(800);
ok('онбординг открывается в режиме ноутбука',
   await ob.evaluate(() => document.getElementById('app').classList.contains('desk')));
ok('и занимает ширину, а не телефонную колонку',
   await ob.evaluate(() => document.getElementById('scr').clientWidth) > 900);
ok('пустой полосы навигации в онбординге нет',
   await ob.evaluate(() => document.getElementById('nav').offsetHeight) === 0);

// ── сбой экрана показывает сообщение, а не пустоту
await ob.getByText('пропустить онбординг').click(); await ob.waitForTimeout(500);
await ob.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  // Ломаем данные так, чтобы экран «День» не смог отрисоваться.
  update(s => { s.quests = null; });
});
await ob.evaluate(() => { location.hash = '#/day'; }); await ob.waitForTimeout(700);
const broken = await ob.locator('.scr').innerText();
ok('вместо пустого экрана — понятное сообщение', /Экран не открылся/.test(broken));
ok('и сказано, что данные целы', /Данные целы/.test(broken));
// Берём экран, который квестов не касается: с «Настройками» сломались бы оба.
await ob.evaluate(() => { location.hash = '#/trips'; }); await ob.waitForTimeout(600);
ok('экран, не зависящий от сломанного, работает', /Страны/i.test(await ob.locator('.scr').innerText()));
await ob.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.quests = {}; });
  location.hash = '#/day';
});
await ob.waitForTimeout(700);
ok('после починки данных экран открывается снова', /Квесты дня/i.test(await ob.locator('.scr').innerText()));

// ── ноутбук
const p = await start({ width: 1512, height: 900 });
ok('режим ноутбука включился', await p.evaluate(() => document.getElementById('app').classList.contains('desk')));

const nav = await p.evaluate(() => {
  const n = document.getElementById('nav');
  const r = n.getBoundingClientRect();
  return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
    items: [...n.querySelectorAll('button')].map(b2 => b2.textContent.trim()) };
});
ok(`навигация стала колонкой слева (${nav.w}×${nav.h})`, nav.x < 40 && nav.w < 260 && nav.h > 500);
ok('в ней все разделы сразу', nav.items.includes('Работа') && nav.items.includes('Забота') && nav.items.includes('Настройки'));
ok('и нет «Ещё» — ящик не нужен', !nav.items.some(t => /Ещё/.test(t)));
await p.locator('[data-nav="care"]').click(); await p.waitForTimeout(600);
ok('переход из колонки работает', (await p.evaluate(() => location.hash)).includes('care'));

await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
const grid = await p.evaluate(() => {
  const scr = document.getElementById('scr');
  const st = getComputedStyle(scr);
  const q = [...scr.querySelectorAll(':scope > .quest')];
  const cards = [...scr.querySelectorAll(':scope > .card')];
  return { display: st.display, cols: st.gridTemplateColumns.split(' ').length,
    questW: q.length ? Math.round(q[0].offsetWidth) : 0,
    cardW: cards.length ? Math.round(cards[0].offsetWidth) : 0,
    scrW: scr.clientWidth,
    questsSameRow: q.length > 1 && Math.abs(q[0].getBoundingClientRect().top - q[1].getBoundingClientRect().top) < 4 };
});
ok(`карточки в две колонки (${grid.cols})`, grid.display === 'grid' && grid.cols === 2);
ok(`карточка занимает половину (${grid.cardW} из ${grid.scrW})`, grid.cardW < grid.scrW * 0.6);
ok('список квестов остался списком во всю ширину', grid.questW > grid.scrW * 0.9);
ok('квесты не разъехались по колонкам', !grid.questsSameRow);

// широкие экраны
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
ok('трекер года идёт во всю ширину',
   await p.evaluate(() => document.getElementById('app').classList.contains('wide')));
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.ui.workTab = 'board'; });
  location.hash = '#/work';
});
await p.waitForTimeout(800);
ok('доска работы тоже', await p.evaluate(() => document.getElementById('app').classList.contains('wide')));
const mainW = await p.evaluate(() => document.getElementById('main').offsetWidth);
ok(`на доске содержимое не сжато (${mainW}px)`, mainW > 1200);

// шторка окном по центру
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(600);
const sheet = await p.evaluate(() => {
  const s = document.querySelector('.sheet'), o = document.querySelector('.overlay');
  const r = s.getBoundingClientRect(), or2 = o.getBoundingClientRect();
  const gapTop = r.top - or2.top, gapBottom = or2.bottom - r.bottom;
  return { w: Math.round(r.width), centered: Math.abs(gapTop - gapBottom) < 60 };
});
ok(`шторка стала окном по центру (${sheet.w}px)`, sheet.centered && sheet.w <= 620);
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(300);

// ── телефон не изменился
const ph = await start(null);
ok('на телефоне режим ноутбука не включается',
   !(await ph.evaluate(() => document.getElementById('app').classList.contains('desk'))));
const pn = await ph.evaluate(() => {
  const n = document.getElementById('nav'); const r = n.getBoundingClientRect();
  return { bottom: r.top > 500, items: [...n.querySelectorAll('button')].map(x => x.textContent.trim()) };
});
ok('навигация снизу и с «Ещё»', pn.bottom && pn.items.some(t => /Ещё/.test(t)));
const pgrid = await ph.evaluate(() => getComputedStyle(document.getElementById('scr')).display);
ok('колонок на телефоне нет', pgrid === 'flex');
await ph.locator('[data-nav="more"]').click(); await ph.waitForTimeout(500);
ok('ящик на телефоне работает', await ph.locator('.drawer').count() === 1);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
