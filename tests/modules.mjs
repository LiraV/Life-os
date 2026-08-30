// Курс: модули, внутри модулей уроки, прогресс считается по конечным точкам.
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

// курс
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(600);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(450);
await p.fill('input[name="name"]', 'СММ-маркетинг');
await p.locator('.opts[data-name="kind"] .opt', { hasText: 'Курс' }).click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.locator('.card', { hasText: 'СММ' }).getByText('СММ-маркетинг').click(); await p.waitForTimeout(500);
console.log('1) кнопка добавления:', await p.locator('[data-act="itemadd"]').innerText());

// два модуля
for (const name of ['Модуль 1 · основы', 'Модуль 2 · воронки']) {
  await p.locator('[data-act="itemadd"]').click(); await p.waitForTimeout(400);
  await p.fill('input[name="title"]', name);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(550);
}
let s = await st();
console.log('2) модулей:', s.lessons[0].items.length, '| прогресс:', (await p.locator('.card', { hasText: 'СММ' }).innerText()).match(/\d+%/)?.[0]);

// уроки в первый модуль
const modId = s.lessons[0].items[0].id;
for (const name of ['Урок 1', 'Урок 2', 'Урок 3']) {
  await p.locator(`[data-act="subadd"][data-i="${modId}"]`).click(); await p.waitForTimeout(400);
  await p.fill('input[name="title"]', name);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(550);
}
s = await st();
console.log('3) уроков в первом модуле:', s.lessons[0].items[0].lessons.length,
  '| строка модуля:', (await p.locator('.chk-row', { hasText: 'Модуль 1' }).innerText()).replace(/\n+/g, ' '));
console.log('   прогресс:', (await p.locator('.card', { hasText: 'СММ' }).innerText()).match(/\d+%/)?.[0], '(0 из 4 конечных точек)');

// отмечаем один урок
await p.locator(`[data-act="sub"][data-i="${modId}"]`).first().click(); await p.waitForTimeout(600);
console.log('4) после одного урока:', (await p.locator('.card', { hasText: 'СММ' }).innerText()).match(/\d+%/)?.[0],
  '| модуль:', (await p.locator('.chk-row', { hasText: 'Модуль 1' }).innerText()).replace(/\n+/g, ' '));

// галочка модуля закрывает все его уроки
await p.locator(`[data-act="item"][data-i="${modId}"]`).click(); await p.waitForTimeout(700);
s = await st();
console.log('5) галочка модуля:', s.lessons[0].items[0].lessons.filter(x => x.done).length, 'из 3 уроков закрыто',
  '| прогресс:', (await p.locator('.card', { hasText: 'СММ' }).innerText()).match(/\d+%/)?.[0]);

// второй модуль без уроков считается одной ступенью
const mod2 = s.lessons[0].items[1].id;
await p.locator(`[data-act="item"][data-i="${mod2}"]`).click(); await p.waitForTimeout(700);
console.log('6) курс целиком:', (await p.locator('.card', { hasText: 'СММ' }).innerText()).match(/\d+%/)?.[0],
  '| тост:', await p.locator('.toast').innerText().catch(() => '—'));

// удаление урока
await p.locator(`[data-act="subdel"][data-i="${modId}"]`).first().click(); await p.waitForTimeout(600);
s = await st();
console.log('7) после удаления урока:', s.lessons[0].items[0].lessons.length, 'осталось');
console.log('ошибки:', errs.length ? errs : 'нет');
await p.screenshot({ path: 'modules.png' });
await b.close();
