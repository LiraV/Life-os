// Лист целей: год и его кварталы одной страницей, которую браузер сохранит
// в PDF. Своего PDF не собираем — библиотека ради этого весила бы больше
// всего приложения; печатаем саму страницу.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const y = await p.evaluate(() => new Date().getFullYear());
await p.evaluate(yy => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.ui.planTab = 'year';
  s.user.name = 'Лера';
  s.years[yy] = { theme: 'Год опоры', quarters: { Q3: 'запустить своё' } };
  s.goals = [
    { id: 'g1', title: 'Защитить диплом', horizon: 'year', period: String(yy), progress: 40, slots: [], steps: [] },
    { id: 'g2', title: 'Накопить на переезд', horizon: 'year', period: String(yy), target: 600000, current: 210000, unit: '₽', slots: [`${yy}-Q4`], steps: [] },
    { id: 'g3', title: 'Запустить планер', horizon: 'quarter', period: `${yy}-Q3`, progress: 70, slots: [], steps: [] },
    { id: 'g4', title: 'Черновик главы 3', horizon: 'month', period: `${yy}-09`, progress: 20, slots: [], steps: [] },
    { id: 'g5', title: 'Старая затея', horizon: 'year', period: String(yy), progress: 0, struck: true, slots: [], steps: [] },
    { id: 'g6', title: 'Убранная цель', horizon: 'year', period: String(yy), progress: 0, archived: true, slots: [], steps: [] },
  ];
  s.intentions = { [String(yy)]: [{ id: 'i1', text: 'меньше обещать, больше доводить' }],
    [`${yy}-Q3`]: [{ id: 'i2', text: 'не брать новых заказов' }] };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.hash = '#/plans/year';
  location.reload();
}, y);
await p.waitForFunction(() => document.querySelector('[data-act="printgoals"]'), null, { timeout: 20000 });
await p.waitForTimeout(400);

// ── кнопка на месте и объясняет, что делать ─────────────────────
const card = await p.locator('.card', { hasText: 'Лист целей' }).innerText();
ok('кнопка есть на вкладке года', /Собрать лист целей/.test(card));
ok('и сказано, как получить PDF', /Сохранить как PDF/.test(card) && /Печать/.test(card), card.replace(/\n/g, ' · ').slice(0, 120));

// ── лист собирается из настоящих целей ──────────────────────────
const sheet = await p.evaluate(async yy => {
  const { sheetHtml } = await import('/app/js/printout.js');
  const el = document.createElement('div');
  el.innerHTML = sheetHtml(yy);
  return el.innerText;
}, y);
ok('в листе год и тема', sheet.includes(String(y)) && /Год опоры/.test(sheet));
ok('и имя человека', /Лера/.test(sheet));
ok('цели года на месте', /Защитить диплом/.test(sheet));
// toLocaleString ставит неразрывные пробелы — сравниваем по ним, а не по обычным.
ok('счётная цель показана числом, а не долей', /210\u00a0000 \/ 600\u00a0000 ₽/.test(sheet),
  (sheet.match(/210[^\n]*/) || [''])[0]);
ok('обычная — долей', /40%/.test(sheet));
ok('вычеркнутая всё равно видна', /Старая затея/.test(sheet));
ok('а убранная — нет', !/Убранная цель/.test(sheet));
ok('намерения года попали', /меньше обещать/.test(sheet));
ok('кварталы все четыре', ['Q1', 'Q2', 'Q3', 'Q4'].every(q => sheet.includes(q)));
ok('заметка квартала на месте', /запустить своё/.test(sheet));
ok('цель квартала тоже', /Запустить планер/.test(sheet));
ok('цели месяцев перечислены', /Черновик главы 3/.test(sheet));
ok('намерения квартала тоже', /не брать новых заказов/.test(sheet));
ok('цель года, положенная в квартал, подписана', /положена в этот квартал/.test(sheet));
ok('пустой квартал так и назван', /пусто/.test(sheet));
ok('внизу дата сборки', /Лист целей · \d\d\.\d\d\.\d{4}/.test(sheet), (sheet.match(/Лист целей[^\n]*/) || [''])[0]);

// ── лист живёт только при печати и убирается после ──────────────
ok('в обычном виде листа на экране нет', await p.locator('#printout').count() === 0);
await p.evaluate(() => {
  // Печать в проверке не открываем — она блокирует страницу; вызываем то же,
  // что делает кнопка, подменив сам вызов печати.
  window.__printed = 0;
  window.print = () => { window.__printed++; };
});
await p.locator('[data-act="printgoals"]').click(); await p.waitForTimeout(500);
ok('кнопка отправляет на печать', await p.evaluate(() => window.__printed) === 1);
ok('и лист был собран', await p.evaluate(() => !!document.getElementById('printout')));
await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
await p.waitForTimeout(200);
ok('после печати лист убран из страницы',
  await p.evaluate(() => (document.getElementById('printout')?.innerHTML || '') === ''));
ok('экран при этом на месте', await p.locator('#scr .card', { hasText: 'Лист целей' }).count() === 1,
  String(await p.locator('#scr .card', { hasText: 'Лист целей' }).count()));

// ── офлайн: каждый модуль перечислен в кэше оболочки ────────────
// Непереченный подтянется из сети при первом заходе на свой экран, но человека
// без сети встретит пустотой. Список однажды уже отстал на два десятка файлов.
const cache = await p.evaluate(async () => {
  const sw = await (await fetch('/sw.js')).text();
  return [...sw.matchAll(/'\.\/(app\/js\/[^']+)'/g)].map(m => m[1]);
});
const used = await p.evaluate(async () => {
  const seen = new Set();
  const walk = async path => {
    if (seen.has(path)) return;
    seen.add(path);
    const src = await (await fetch('/' + path)).text();
    const dir = path.slice(0, path.lastIndexOf('/'));
    for (const m of src.matchAll(/from\s+'([^']+\.js)'/g)) {
      let rel = m[1];
      if (!rel.startsWith('.')) continue;
      const parts = (dir + '/' + rel).split('/');
      const out = [];
      for (const x of parts) { if (x === '.') continue; if (x === '..') out.pop(); else out.push(x); }
      await walk(out.join('/'));
    }
  };
  await walk('app/js/main.js');
  return [...seen];
});
const missing = used.filter(x => !cache.includes(x));
ok('все модули приложения перечислены в кэше', missing.length === 0, missing.join(', '));
ok('и лист целей среди них', cache.includes('app/js/printout.js'));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ лист целей собирается');
process.exit(bad ? 1 : 0);
