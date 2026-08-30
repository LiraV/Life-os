// Темы: переключение, запоминание, полнота палитры и читаемость.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(700);

const picks = p.locator('.themes .icon-pick');
ok('шесть тем в настройках', await picks.count() === 6, String(await picks.count()));
ok('по умолчанию рассвет', await p.locator('.themes .icon-pick.on').getAttribute('data-id') === 'dawn');
ok('на рассвете атрибута темы нет', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === null);

// ── полнота палитры: каждая тема задаёт весь набор переменных
const TOKENS = await p.evaluate(() => {
  const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch { return []; } });
  const root = css.find(r => r.selectorText === ':root');
  return [...root.style].filter(n => n.startsWith('--') && !n.startsWith('--r-'));
});
ok('в :root набралось токенов', TOKENS.length > 30, String(TOKENS.length));
const missing = await p.evaluate(keys => {
  const css = [...document.styleSheets].flatMap(sh => { try { return [...sh.cssRules]; } catch { return []; } });
  const out = {};
  ['night', 'sage', 'sea', 'plum', 'sand'].forEach(t => {
    const rule = css.find(r => r.selectorText === `[data-theme="${t}"]`);
    const have = rule ? [...rule.style] : [];
    const lost = keys.filter(k => !have.includes(k));
    if (lost.length) out[t] = lost;
  });
  return out;
}, TOKENS);
ok('ни одна тема не забыла переменную', Object.keys(missing).length === 0, JSON.stringify(missing));

// ── переключение
await p.locator('.themes .icon-pick[data-id="night"]').click(); await p.waitForTimeout(600);
ok('атрибут темы проставился', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'night');
ok('выбор записан', (await st()).ui.theme === 'night');
ok('цвет строки состояния сменился',
  await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content) === '#272029');
const dark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
ok('фон стал тёмным', dark === 'rgb(16, 13, 17)', dark);

// ── переживает перезагрузку и ставится до первого кадра
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(150);
ok('тема стоит уже на первых кадрах', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'night');
await p.waitForTimeout(800);
ok('после перезапуска тема та же', (await st()).ui.theme === 'night');

// ── читаемость: текст и фон карточки не сливаются ни в одной теме
const lum = c => { const [r, g, bb] = c.match(/\d+/g).map(Number).map(v => { const x = v / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * bb; };
for (const t of ['dawn', 'night', 'sage', 'sea', 'plum', 'sand']) {
  await p.evaluate(async k => {
    const { setTheme } = await import('./app/js/theme.js');
    setTheme(k);
  }, t);
  await p.waitForTimeout(400);
  await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
  const pair = await p.evaluate(() => {
    const card = document.querySelector('.card');
    const ink = document.querySelector('.card .ink, .card .lab, .card') || card;
    return { bg: getComputedStyle(card).backgroundColor, fg: getComputedStyle(ink).color };
  });
  const l1 = lum(pair.bg), l2 = lum(pair.fg);
  const ratio = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
  ok(`${t}: текст на карточке читается`, ratio >= 4.5, `контраст ${ratio.toFixed(1)}`);
  await p.screenshot({ path: `theme-${t}.png` });
}

// ── мусор в состоянии откатывается к рассвету
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.theme = 'нет-такой';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
ok('чужая тема откатывается к рассвету', await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === null);

// ── старые данные без поля темы
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  delete s.ui.theme;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
ok('без поля темы приложение живо', await p.locator('.scr').count() === 1);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
