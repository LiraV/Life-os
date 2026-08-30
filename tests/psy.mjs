// Тесты по опубликованным методикам: прохождение, подсчёт, влияние на профиль.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; }); closeSheet();
    const raw = localStorage.getItem('lifeos.state');
    if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
  } catch {}
});

await p.evaluate(() => { location.hash = '#/inside/tests'; }); await p.waitForTimeout(600);
const names = await p.locator('.card .ink b').allInnerTexts();
console.log('1) тестов:', names.length, '·', names.join(', '));
console.log('   источники видны:', (await p.locator('.scr').innerText()).includes('Gosling'));

// проходим шкалу до конца, отвечая одинаково
const pass = async (key, pick) => {
  await p.evaluate(() => { location.hash = '#/inside/tests'; }); await p.waitForTimeout(400);
  await p.locator(`[data-act="start"][data-v="${key}"]`).click(); await p.waitForTimeout(400);
  for (let i = 0; i < 40; i++) {
    const btns = p.locator('[data-act="answer"]');
    const n = await btns.count();
    if (!n) break;
    await btns.nth(typeof pick === 'function' ? pick(i, n) : Math.min(pick, n - 1)).click();
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(300);
  const res = (await p.locator('.card', { hasText: '· результат' }).first().innerText()).replace(/\n+/g, ' | ');
  await p.locator('[data-act="accept"]').click(); await p.waitForTimeout(500);
  return res;
};

console.log('2) TIPI:', (await pass('tipi', (i, n) => n - 1)).slice(0, 150));
let s = await st();
// В TIPI половина пунктов обратные, поэтому «всё на максимум» даёт середину —
// это правильное поведение шкалы, а не ошибка подсчёта.
console.log('   интроверсия из теста:', s.user.introversion, '(обратные пункты дают середину — так и должно быть)');
console.log('   черта:', s.tests.tipi.trait);

console.log('3) Grit:', (await pass('grit', (i, n) => n - 1)).slice(0, 130));
s = await st();
console.log('   черта:', s.tests.grit.trait);

console.log('4) rMEQ:', (await pass('chrono', () => 0)).slice(0, 120));
s = await st();
console.log('   хронотип в профиле:', s.user.chronotype);

console.log('5) фокус:', (await pass('focus', (i, n) => (i < 4 ? n - 1 : 0))).slice(0, 130));
console.log('6) самосострадание:', (await pass('selfcare', () => 0)).slice(0, 200));

s = await st();
console.log('7) сохранено тестов:', Object.keys(s.tests).length, '· записей в дневнике:', s.diary.length);
console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/inside/tests'; }); await p.waitForTimeout(500);
await p.screenshot({ path: 'psy.png' });
await b.close();
