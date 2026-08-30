// Бюджет отмечает, когда его в последний раз заполняли.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
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

await p.evaluate(() => { location.hash = '#/budget'; }); await p.waitForTimeout(700);
console.log('1) до заполнения:', (await p.locator('.scr').innerText()).split('\n')[3]);

// операция ставит отметку
await p.locator('.pill[data-act="tab"][data-v="ops"]').click(); await p.waitForTimeout(400);
await p.locator('[data-act="opadd"]').first().click(); await p.waitForTimeout(450);
await p.fill('input[name="sum"]', '1200');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
console.log('2) после операции:', (await p.locator('.scr').innerText()).split('\n')[3], '| в состоянии:', (s.budget.updatedAt || '').slice(0, 16));

// переключение вкладок и месяцев отметку не двигает
const was = (await st()).budget.updatedAt;
await p.locator('.pill[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
await p.locator('[data-act="next"]').first().click(); await p.waitForTimeout(400);
await p.locator('[data-act="prev"]').first().click(); await p.waitForTimeout(400);
console.log('3) листание не считается заполнением:', (await st()).budget.updatedAt === was);

// правка плана статьи двигает
await p.locator('[data-act="catedit"]').first().click(); await p.waitForTimeout(450);
await p.fill('input[name="plan"]', '5000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
console.log('4) правка плана обновила отметку:', (await st()).budget.updatedAt !== was);

// стартовая сумма — она живёт на вкладке месяца
const was2 = (await st()).budget.updatedAt;
await p.locator('.pill[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
await p.locator('[data-act="startset"]').first().click(); await p.waitForTimeout(450);
await p.fill('input[name="n"]', '15000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
console.log('5) стартовая сумма обновила отметку:', (await st()).budget.updatedAt !== was2);
console.log('   подпись на экране:', (await p.locator('.scr').innerText()).split('\n')[3]);

// правило — тоже заполнение, и проверяем это через экран, а не в обход
const was3 = (await st()).budget.updatedAt;
await p.locator('[data-act="ruleadd"]').first().click(); await p.waitForTimeout(450);
await p.fill('textarea[name="text"]', 'Никакой Лавки').catch(async () => { await p.fill('input[name="text"]', 'Никакой Лавки'); });
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const st4 = await st();
console.log('6) правило записалось:', st4.budget.rules.includes('Никакой Лавки'), '| отметка сдвинулась:', st4.budget.updatedAt !== was3);

console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
