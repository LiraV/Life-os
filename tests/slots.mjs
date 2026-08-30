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
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);

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
await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' }); await p.waitForTimeout(400);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(400);

// 1. цель года без срока
await p.getByText('+ Цель года').click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Выучить итальянский до B2');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('1) карточка:', (await p.locator('.card', { hasText: 'итальянский' }).innerText()).replace(/\n+/g, ' | '));
let st = await state();
console.log('   слоты:', JSON.stringify(st.goals[0].slots));

// 2. положить в квартал
await p.locator('[data-act="plan"]').first().click(); await p.waitForTimeout(400);
console.log('2) шторка:', await p.locator('.sheet-sub').innerText());
console.log('   варианты:', await p.locator('select[name="slot"]').evaluate(e => [...e.options].map(o => o.text).join(' | ')));
await p.selectOption('select[name="slot"]', await p.locator('select[name="slot"]').evaluate(e => [...e.options].find(o => o.text.startsWith('Q4')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
st = await state();
console.log('   слоты после:', JSON.stringify(st.goals[0].slots), '| экран:', await p.locator('.pill.on').innerText());
const q4 = await p.locator('.card.mute', { hasText: 'окт–ноя–дек' }).innerText();
console.log('   в Q4 видно:', q4.replace(/\n+/g, ' | ').slice(0, 110));

// 3. положить ту же цель ещё и в месяц
await p.locator('.card', { hasText: 'ЦЕЛИ ГОДА' }).count();
await p.locator('[data-act="plan"]').first().click(); await p.waitForTimeout(400);
await p.locator('.opts[data-name="kind"] .opt', { hasText: 'В месяц' }).click(); await p.waitForTimeout(300);
const months = await p.locator('select[name="slot"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
console.log('3) месяцы:', months.slice(0, 80));
await p.selectOption('select[name="slot"]', await p.locator('select[name="slot"]').evaluate(e => [...e.options].find(o => o.text.startsWith('Ноябрь')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
st = await state();
console.log('   слоты:', JSON.stringify(st.goals[0].slots), '| целей всего:', st.goals.length, '(копий не создано)');
console.log('   экран месяца:', (await p.locator('.scr').innerText()).split('\n').filter(l => /Ноябрь|Положены|итальянск|убрать/.test(l)).join(' | '));
await p.screenshot({ path: 'slots-month.png' });

// 4. этап отмечаем в месяце — прогресс тот же объект
await p.getByText('Выучить итальянский до B2').click(); await p.waitForTimeout(300);
await p.getByText('+ Этап').click(); await p.waitForTimeout(250);
await p.fill('input[name="title"]', 'Сдать пробный тест');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(350);
await p.locator('.chk-row', { hasText: 'Сдать пробный тест' }).locator('.check').click(); await p.waitForTimeout(400);
st = await state();
console.log('4) этапов у цели:', st.goals[0].steps.length, '| выполнено:', st.goals[0].steps.filter(x => x.done).length);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(400);
console.log('   на экране года:', (await p.locator('.scr').innerText()).split('\n').filter(l => /100%|итальянск|Q4|ноябрь/.test(l)).slice(0, 6).join(' | '));

// 5. убрать из периода
await p.locator('.card.mute', { hasText: 'окт–ноя–дек' }).locator('[data-act="unplan"]').first().click(); await p.waitForTimeout(500);
st = await state();
console.log('5) после «убрать отсюда»:', JSON.stringify(st.goals[0].slots), '| цель жива:', !!st.goals.find(g => g.title.includes('итальянский')));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
