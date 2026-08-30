// Быстрые воротца: за секунды ловят сломанный синтаксис, битые импорты и
// падения на экранах. Это не замена набору проверок — это то, что стоит
// гонять после каждой правки, пока полный прогон идёт своим чередом.
import { chromium, devices } from './pw.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/user/Life-os';
const files = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const full = path.join(d, e.name);
  if (e.isDirectory()) walk(full);
  else if (e.name.endsWith('.js')) files.push(path.relative(ROOT, full));
});
walk(path.join(ROOT, 'app/js'));

const T0 = Date.now(); const mark = n => console.error(`  ${n}: ${Date.now() - T0} мс`);
const b = await chromium.launch();
mark('запуск браузера');
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы. Обрываем сразу — приложению они не нужны для работы.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|401/.test(m.text())) errs.push('CONSOLE: ' + m.text().slice(0, 120)); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(300);
mark('загрузка страницы');

// 1. Каждый модуль должен разбираться и грузиться — даже тот, что не нужен
//    стартовому экрану: именно там прячется лишняя скобка.
const broken = await p.evaluate(async list => {
  const res = await Promise.all(list.map(f =>
    import('./' + f).then(() => null).catch(e => `${f}: ${String(e.message).slice(0, 90)}`)));
  return res.filter(Boolean);
}, files);
mark('импорт модулей');
console.log(broken.length ? '✗ модули: ' + broken.join(' | ') : `✓ модули: ${files.length} загрузились`);

// 2. Онбординг и все экраны — на каждом не должно быть падений.
await p.getByText('пропустить онбординг').click().catch(() => {});
await p.waitForTimeout(300);
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; });
    closeSheet();
    const raw = localStorage.getItem('lifeos.state');
    if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
  } catch {}
});

const ROUTES = ['day', 'plans', 'inside', 'me', 'spheres', 'tracker', 'habits', 'health', 'care',
  'sport', 'study', 'edu', 'food', 'budget', 'library', 'trips', 'free', 'biz', 'work', 'inbox', 'settings', 'inside/tests', 'inside/diary'];
const empty = [];
for (const r of ROUTES) {
  // Отрисовка синхронная по hashchange — ждать таймером нечего, хватает кадра.
  const len = await p.evaluate(async x => {
    location.hash = '#/' + x;
    await new Promise(requestAnimationFrame);
    return (document.querySelector('.scr')?.innerText || '').trim().length;
  }, r);
  if (len < 20) empty.push(r);
}
mark('обход экранов');
console.log(empty.length ? '✗ пустые экраны: ' + empty.join(', ') : `✓ экраны: ${ROUTES.length} отрисовались`);
console.log(errs.length ? '✗ ошибки: ' + errs.slice(0, 4).join(' | ') : '✓ ошибок в консоли нет');
await b.close();
process.exit(broken.length || empty.length || errs.length ? 1 : 0);
