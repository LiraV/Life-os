// Навигация: на любом экране меню отвечает на вопрос «где я».
// Экраны сфер подсвечивают «Сферы», вкладки «Внутри» — свои пункты.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
// Меню рисуется вместе с экраном; ждём именно его, а не круглое число миллисекунд.
const ready = pg => pg.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
const atHash = (pg, r) => pg.waitForFunction(h => location.hash === '#/' + h, r, { timeout: 20000 });

// Все экраны приложения плюс адреса с параметром.
const ROUTES = ['day','plans','inside','me','inbox','spheres','work','habits','tracker','health','care',
  'library','trips','settings','food','budget','edu','study','sport','free','biz',
  'inside/diary','inside/tests','inside/chat','biz/none','spheres/blog'];

for (const [mode, opts] of [['телефон', { ...devices['iPhone 13'] }], ['ноутбук', { viewport: { width: 1280, height: 860 } }]]) {
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...opts });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
  await ready(p);

  const at = async r => {
    await p.evaluate(h => { location.hash = '#/' + h; }, r);
    await atHash(p, r);
    return p.evaluate(() => [...document.querySelectorAll('#nav button.on')].map(x => x.textContent.trim()));
  };

  for (const r of ROUTES) {
    const on = await at(r);
    ok(`${mode}: на «${r}» меню подсвечено`, on.length === 1, on.join(',') || 'ничего');
  }
  // Экран сферы — свой пункт меню на ноутбуке и «Ещё» на телефоне,
  // но никогда не молчание и не чужой пункт.
  ok(`${mode}: «Бюджет» подсвечен собой`, (await at('budget'))[0] === (mode === 'телефон' ? '☰ Ещё' : 'Бюджет'));
  ok(`${mode}: «Фриланс» подсвечен собой`, (await at('free'))[0] === (mode === 'телефон' ? '☰ Ещё' : 'Фриланс'));
  // Сфера без своего экрана всё равно находится в меню.
  ok(`${mode}: «Блог» подсвечен собой`, (await at('spheres/blog'))[0] === (mode === 'телефон' ? '☰ Ещё' : 'Блог'));
  ok(`${mode}: «День» — это «День»`, (await at('day'))[0] === 'День');
  await ctx.close();
}

// ── меню: всё в двух тапах, «назад» возвращает туда, откуда пришли ──
{
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
  await ready(p);
  const hash = () => p.evaluate(() => location.hash);

  // Бюджет — два тапа, а не три
  await p.click('[data-nav="more"]'); await p.waitForTimeout(250);
  ok('в меню есть заголовки групп', await p.locator('.drawer .menu-head').count() >= 4);
  await p.locator('.drawer [data-drawer="budget"]').click(); await p.waitForTimeout(350);
  ok('«Бюджет» открылся в два тапа', (await hash()) === '#/budget', await hash());

  // «назад» возвращает туда, откуда пришли, а не на «Сферы»
  await p.click('[data-act="back"]'); await p.waitForTimeout(350);
  ok('«назад» с «Бюджета» вернул на «День»', (await hash()) === '#/day', await hash());

  // и не добавляет шаг: системное «назад» не возвращает на покинутый экран
  await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(300);
  await p.click('[data-act="back"]'); await p.waitForTimeout(350);
  const afterBack = await hash();
  await p.goBack(); await p.waitForTimeout(350);
  ok('системное «назад» не возвращает на покинутый экран', (await hash()) !== '#/work', await hash());
  ok('«назад» с «Работы» вернул на «День»', afterBack === '#/day', afterBack);

  // прямая ссылка: возвращаться некуда — ведём к сферам
  await p.goto('http://127.0.0.1:8765/#/budget', { waitUntil: 'load' }); await ready(p);
  await p.click('[data-act="back"]'); await p.waitForTimeout(350);
  ok('по прямой ссылке «назад» ведёт к сферам', (await hash()) === '#/spheres', await hash());

  // неизвестный адрес: экран и строка адреса говорят одно
  await p.evaluate(() => { location.hash = '#/чего-нет'; }); await p.waitForTimeout(400);
  ok('неизвестный адрес приводится к «Дню»', (await hash()) === '#/day', await hash());

  // убранная с глаз сфера уходит и из меню
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.spheresHidden = ['trips']; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
  await ready(p);
  await p.click('[data-nav="more"]'); await p.waitForTimeout(250);
  ok('убранная сфера ушла из меню', await p.locator('.drawer [data-drawer="trips"]').count() === 0);
  ok('остальные пункты на месте', await p.locator('.drawer [data-drawer="budget"]').count() === 1);
  await ctx.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ навигация отвечает везде');
process.exit(bad ? 1 : 0);
