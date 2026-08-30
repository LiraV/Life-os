// Шапка экрана держится наверху при прокрутке.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});

const head = () => p.evaluate(() => {
  const box = document.querySelector('.scr-head');
  const scr = document.getElementById('scr');
  if (!box) return null;
  const r = box.getBoundingClientRect(), s = scr.getBoundingClientRect();
  return { top: Math.round(r.top - s.top), h: box.offsetHeight, scrH: scr.clientHeight,
    kids: [...box.children].map(x => x.className.split(' ')[0]),
    glass: getComputedStyle(box).backgroundColor,
    scrolled: scr.classList.contains('scrolled') };
});
const go = async (r, y = 0) => {
  await p.evaluate(x => { location.hash = '#/' + x; }, r);
  await p.waitForTimeout(450);
  if (y) { await p.evaluate(v => { document.getElementById('scr').scrollTop = v; }, y); await p.waitForTimeout(350); }
};

// ── «Внутри»: заголовок и вкладки остаются
await go('inside/mind');
let hd = await head();
ok('шапка собралась из заголовка и вкладок', JSON.stringify(hd.kids) === JSON.stringify(['title', 'pills']));
ok('на месте фона у шапки нет', hd.glass === 'rgba(0, 0, 0, 0)' && !hd.scrolled);
await p.evaluate(() => { document.getElementById('scr').scrollTop = 500; }); await p.waitForTimeout(400);
hd = await head();
ok('после прокрутки шапка осталась наверху', hd.top <= 3);
ok('и получила плотный фон', hd.scrolled && hd.glass !== 'rgba(0, 0, 0, 0)');
ok('вкладки доступны в прокрученном состоянии',
   await p.locator('.scr-head [data-act="tab"][data-v="tests"]').isVisible());
await p.locator('.scr-head [data-act="tab"][data-v="tests"]').click(); await p.waitForTimeout(600);
ok('и переключают экран', (await p.evaluate(() => location.hash)).includes('tests'));

// ── «День»: липнет управление датой
await go('day', 400);
hd = await head();
ok('на «Дне» липнет переключатель даты', JSON.stringify(hd.kids) === JSON.stringify(['stepper']));
ok('он остался наверху', hd.top <= 3);
ok('стрелки дат доступны', await p.locator('.scr-head [data-act="prev"]').isVisible());

// ── высокая шапка не съедает экран
await go('plans', 300);
hd = await head();
ok(`шапка планов не выше трети экрана (${hd.h} из ${hd.scrH})`, hd.h <= hd.scrH / 3);

// ── смена экрана сбрасывает фон
await go('spheres');
hd = await head();
ok('на новом экране фон снова снят', !hd.scrolled);

// ── подсказка экрана в шапку не попадает
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.ui.tips = 'on'; s.ui.tipsSeen = {}; });
});
await go('health');
const withTip = await p.evaluate(() => {
  const kids = [...document.getElementById('scr').children].map(x => x.className.split(' ').slice(0, 2).join(' '));
  const box = document.querySelector('.scr-head');
  return { first: kids[0], second: kids[1], inHead: box ? [...box.children].map(x => x.className.split(' ')[0]) : null };
});
ok('подсказка осталась прокручиваемой', withTip.first.includes('card'));
ok('а шапка собралась после неё', withTip.second === 'scr-head'
   && JSON.stringify(withTip.inHead) === JSON.stringify(['title', 'sub', 'pills']));

// ── все экраны переживают обёртку
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.ui.tips = 'off'; });
});
const routes = ['day', 'plans', 'inside/chat', 'me', 'spheres', 'tracker', 'habits', 'health',
  'care', 'sport', 'study', 'edu', 'food', 'budget', 'library', 'trips', 'settings', 'inbox', 'work'];
let missing = [];
for (const r of routes) {
  await go(r, 250);
  const info = await head();
  if (!info) missing.push(r);
  else if (info.top > 3) missing.push(r + ':не липнет');
}
ok(`шапка есть и держится на всех экранах${missing.length ? ' — кроме ' + missing.join(', ') : ''}`, !missing.length);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
