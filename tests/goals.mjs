import { chromium } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  viewport: { width: 400, height: 900 }, locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click();

// Предложение про подсказки в тестах не участвует. Гасим его через состояние,
// а не кликом: так не ждём анимацию шторки и не зависим от её появления.
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; });
    closeSheet();
    // Сохранение в приложении отложенное, а тесты правят хранилище сразу —
    // поэтому дублируем запись, чтобы отказ не потерялся при перезагрузке.
    const raw = localStorage.getItem('lifeos.state');
    if (raw) {
      const cur = JSON.parse(raw);
      (cur.ui ||= {}).tips = 'off';
      localStorage.setItem('lifeos.state', JSON.stringify(cur));
    }
  } catch { /* страница без приложения — гасить нечего */ }
});
await p.waitForTimeout(400);
await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' });
await p.waitForTimeout(400);
await p.locator('[data-act="tab"][data-v="year"]').click();
await p.waitForTimeout(400);

// 1. цель года
await p.getByText('+ Цель года').click(); await p.waitForTimeout(350);
console.log('1) шторка:', await p.locator('.sheet-title').innerText());
await p.fill('input[name="title"]', 'Найти свой голос');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
let st = await state();
console.log('   цель года:', JSON.stringify(st.goals.map(g => ({ t: g.title, h: g.horizon, p: g.period }))));

// 2. цель квартала, ведущая к цели года
await p.locator('.card', { hasText: 'Q3' }).getByText('+ Цель квартала').click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Сдать диплом');
console.log('2) период по умолчанию:', await p.locator('select[name="period"]').inputValue());
console.log('   варианты «ведёт к»:', await p.locator('select[name="parentId"]').evaluate(e => [...e.options].map(o => o.text).join(' | ')));
await p.selectOption('select[name="parentId"]', await p.locator('select[name="parentId"]')
  .evaluate(e => [...e.options].find(o => o.text.includes('Найти свой голос')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
const yGoal = st.goals.find(g => g.horizon === 'year');
const qGoal = st.goals.find(g => g.horizon === 'quarter');
console.log('   цель квартала:', qGoal.title, '| период', qGoal.period, '| ведёт к', qGoal.parentId === yGoal.id ? 'цели года ✓' : 'НЕ ПРИВЯЗАНА');

// 3. цель месяца под цель квартала
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(300);
await p.getByText('+ Цель месяца').click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Черновик главы 2');
await p.selectOption('select[name="parentId"]', await p.locator('select[name="parentId"]')
  .evaluate(e => [...e.options].find(o => o.text.includes('Сдать диплом')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
const mGoal = st.goals.find(g => g.horizon === 'month');
console.log('3) цель месяца:', mGoal.title, '| ведёт к', mGoal.parentId === qGoal.id ? 'цели квартала ✓' : 'НЕ ПРИВЯЗАНА');

// 4. этапы у месячной цели -> прогресс должен подняться вверх по цепочке
await p.getByText('Черновик главы 2').click(); await p.waitForTimeout(300);
for (const t of ['План', 'Текст', 'Правка']) {
  await p.getByText('+ Этап').click(); await p.waitForTimeout(200);
  await p.fill('input[name="title"]', t);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(250);
}
await p.locator('.chk-row', { hasText: 'План' }).locator('.check').click(); await p.waitForTimeout(400);
const monthPct = await p.locator('.card', { hasText: 'Черновик главы 2' }).locator('.lab').filter({ hasText: '%' }).first().innerText();
console.log('4) прогресс цели месяца:', monthPct);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(400);
const txt = await p.locator('.scr').innerText();
console.log('   на экране года:', txt.split('\n').filter(l => /%|Найти свой голос|Сдать диплом|Черновик/.test(l)).join(' | '));
await p.screenshot({ path: 'goals-year.png' });

// 5. правка цели года
await p.locator('.card', { hasText: 'Найти свой голос' }).getByText('изменить ›').first().click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Свой голос — и вслух');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('5) после правки:', st.goals.find(g => g.horizon === 'year').title);

// 6. смена горизонта у существующей цели
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(300);
await p.locator('.card', { hasText: 'Черновик главы 2' }).getByText('изменить ›').first().click(); await p.waitForTimeout(350);
await p.locator('.opts[data-name="horizon"] .opt', { hasText: 'Квартал' }).click(); await p.waitForTimeout(300);
console.log('6) после смены горизонта период стал:', await p.locator('select[name="period"]').inputValue());
console.log('   «ведёт к» теперь:', await p.locator('select[name="parentId"]').evaluate(e => [...e.options].map(o => o.text).join(' | ')));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('   цель стала:', JSON.stringify(st.goals.map(g => g.horizon + ':' + g.period)));
console.log('   экран переключился на:', await p.locator('.pill.on').innerText());

// 7. архив
await p.locator('.card', { hasText: 'Сдать диплом' }).getByText('изменить ›').first().click(); await p.waitForTimeout(350);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('7) архив:', st.goals.filter(g => g.archived).map(g => g.title).join(', '), '| осиротевшие отвязаны:',
  st.goals.filter(g => !g.archived).every(g => !g.parentId || st.goals.some(x => x.id === g.parentId && !x.archived)));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
