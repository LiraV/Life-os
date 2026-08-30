// Страны: поиск, отметка, повторная поездка, годы, части света.
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

await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
console.log('1) сфера в списке:', (await p.locator('.scr').innerText()).includes('Страны'));
await p.locator('[data-act="open"][data-v="trips"]').click(); await p.waitForTimeout(600);
console.log('   пусто:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | '));

// поиск и отметка
await p.locator('.pill[data-act="tab"][data-v="add"]').click(); await p.waitForTimeout(500);
await p.fill('[data-field="q"]', 'тур'); await p.waitForTimeout(500);
console.log('2) поиск «тур»:', (await p.locator('.care-name .ink').allInnerTexts()).join(' | '));
await p.locator('.link-row', { hasText: 'Турция' }).click(); await p.waitForTimeout(600);
let s = await st();
console.log('   отмечено:', JSON.stringify(s.travel.visits[0]).slice(0, 80));

// поиск без учёта регистра и «ё»
await p.fill('[data-field="q"]', 'ГРУЗ'); await p.waitForTimeout(500);
await p.locator('.link-row', { hasText: 'Грузия' }).click(); await p.waitForTimeout(600);
await p.fill('[data-field="q"]', 'япони'); await p.waitForTimeout(400);
await p.locator('.link-row', { hasText: 'Япония' }).click(); await p.waitForTimeout(600);

// за жизнь
await p.locator('.pill[data-act="tab"][data-v="life"]').click(); await p.waitForTimeout(600);
const life = await p.locator('.card').first().innerText();
console.log('3) за жизнь:', life.replace(/\n+/g, ' | '));
console.log('   по частям света:', (await p.locator('.card .caps').allInnerTexts()).join(' / '));
console.log('   флаги на месте:', (await p.locator('.chip').first().innerText()).slice(0, 12));

// повторная поездка в ту же страну
await p.locator('.chip', { hasText: 'Турция' }).click(); await p.waitForTimeout(500);
console.log('4) шторка страны:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="year"]', '2019');
await p.fill('input[name="note"]', 'Каппадокия');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
console.log('   поездок:', s.travel.visits.length, '| стран за жизнь по-прежнему:',
  (await p.locator('.card').first().innerText()).match(/\d+/)?.[0]);

// по годам
await p.locator('.pill[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(600);
console.log('5) текущий год:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | ').slice(0, 90));
await p.locator('[data-act="goyear"][data-v="2019"]').click(); await p.waitForTimeout(600);
console.log('   2019:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | ').slice(0, 80));

// правка отметки
await p.locator('.pill[data-act="tab"][data-v="add"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(700);
s = await st();
console.log('6) после удаления отметки:', s.travel.visits.length, 'поездок');
console.log('ошибки:', errs.length ? errs : 'нет');
await p.locator('.pill[data-act="tab"][data-v="life"]').click(); await p.waitForTimeout(600);
await p.screenshot({ path: 'trips.png' });
await b.close();
