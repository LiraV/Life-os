// Библиотека: путь книги по полке, прогресс, год и строка в трекере.
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

// сфера на своём месте
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
console.log('1) сфера в списке:', (await p.locator('.scr').innerText()).includes('Библиотека'));
await p.locator('[data-act="open"][data-v="books"]').click(); await p.waitForTimeout(600);
console.log('   открылась:', await p.locator('.title').innerText(), '| вкладки:', (await p.locator('.pills .pill').allInnerTexts()).join(' | '));

// заводим книгу «хочу прочитать»
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(450);
await p.fill('input[name="title"]', 'Хребты безумия');
await p.fill('input[name="author"]', 'Лавкрафт');
await p.fill('input[name="pages"]', '240');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
let s = await st();
console.log('2) книга заведена:', s.library.books[0].title, '| статус:', s.library.books[0].status);
console.log('   в «хочу»:', (await p.locator('.card', { hasText: 'Хочу прочитать' }).innerText()).replace(/\n+/g, ' | '));

// закладка переводит в «читаю»
await p.locator('.link-row', { hasText: 'Хребты' }).click(); await p.waitForTimeout(450);
await p.locator('.opts[data-name="status"] .opt', { hasText: 'Читаю' }).click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
await p.locator('[data-act="page"]').click(); await p.waitForTimeout(450);
await p.fill('input[name="page"]', '60');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
const card = await p.locator('.card', { hasText: 'Хребты' }).innerText();
console.log('3) читаю:', card.replace(/\n+/g, ' | ').slice(0, 120));
s = await st();
console.log('   дата начала проставилась:', !!s.library.books[0].started);

// дочитала
await p.locator('[data-act="finish"]').click(); await p.waitForTimeout(500);
await p.locator('.opts[data-name="rating"] .opt', { hasText: '★★★★' }).first().click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const bk = s.library.books[0];
console.log('4) дочитана:', bk.status, '| оценка:', bk.rating, '| страница = объём:', bk.page === bk.pages, '| дата:', !!bk.finished);

// год
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(600);
console.log('5) год:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | '));

// полка
await p.locator('[data-act="tab"][data-v="shelf"]').click(); await p.waitForTimeout(600);
console.log('6) полка:', (await p.locator('.card .caps').allInnerTexts()).join(' / '));

// трекер года подхватил строку
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
console.log('7) в трекере:', (await p.locator('.tr tbody tr', { hasText: 'Книги' }).innerText()).replace(/\s+/g, ' '));
console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/library'; }); await p.waitForTimeout(600);
await p.screenshot({ path: 'books.png' });
await b.close();
