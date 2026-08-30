// Строки «текст слева — подпись справа» должны быть в одну линию.
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

// строка инбокса на «Дне» — та, что была сломана
await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => { s.inbox.push({ id: uid(), text: 'Позвонить маме', note: '', sphere: '', createdAt: todayISO() }); });
});
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
const row = await p.evaluate(() => {
  const el = document.querySelector('[data-act="toinbox"]');
  if (!el) return null;
  const st = getComputedStyle(el);
  const kids = [...el.children].map(x => x.getBoundingClientRect());
  return { dir: st.flexDirection, sameLine: Math.abs(kids[0].top - kids[1].top) < 4,
           chevronRight: kids[1].left > kids[0].left, h: el.offsetHeight };
});
ok('строка инбокса — в одну линию', row && row.dir === 'row' && row.sameLine && row.chevronRight);
ok(`и не в две строки по высоте (${row.h}px)`, row.h < 34);

// все такие строки на всех экранах
const routes = ['day', 'care', 'library', 'trips', 'spheres', 'work', 'inbox', 'plans'];
let broken = [];
for (const r of routes) {
  await p.evaluate(x => { location.hash = '#/' + x; }, r);
  await p.waitForTimeout(400);
  const bads = await p.evaluate(() => [...document.querySelectorAll('.link-row')]
    .filter(el => {
      const k = [...el.children];
      return k.length > 1 && Math.abs(k[0].getBoundingClientRect().top - k[1].getBoundingClientRect().top) > 4;
    }).length);
  if (bads) broken.push(`${r}:${bads}`);
}
ok(`нигде не осталось строк столбиком${broken.length ? ' — ' + broken.join(', ') : ''}`, !broken.length);
ok('старой связки классов не осталось',
   await p.evaluate(() => document.body.innerHTML.indexOf('row between care-name') === -1));

// .care-name как задумывался — всё ещё колонка
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(500);
await p.locator('[data-act="suggest"]').first().click().catch(() => {});
await p.waitForTimeout(500);
if (await p.locator('[data-sheet="save"]').count()) {
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
}
const col = await p.evaluate(() => {
  const el = document.querySelector('.care-row .care-name');
  return el ? getComputedStyle(el).flexDirection : null;
});
ok('в «Заботе» имя дела осталось колонкой', col === 'column');

// подсветка при наведении не должна липнуть на тач-экране
const hoverGuarded = await p.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r.type === CSSRule.STYLE_RULE && r.selectorText?.includes(':hover')) return false;
    }
  }
  return true;
});
ok('правил :hover вне запроса о курсоре не осталось', hoverGuarded);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
