// Подходы и повторы правятся после ввода — и в тренировке, и в шаблоне.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const pick = async (name) => p.selectOption('select[name="exerciseId"]',
  await p.locator('select[name="exerciseId"]').evaluate((e, n) => [...e.options].find(o => o.text.startsWith(n)).value, name));

const openW = async () => { if (await p.locator('.w-sets').count() === 0) { await p.locator('[data-act="wtoggle"]').first().click(); await p.waitForTimeout(400); } };
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);

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

// ── тренировка на дне
await p.getByText('+ тренировка').click(); await p.waitForTimeout(450);
await p.fill('input[name="title"]', 'Зал А');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
await openW(); await p.locator('[data-act="wsetadd"]').click(); await p.waitForTimeout(450);
console.log('1) поля:', (await p.locator('.sheet-body label').allInnerTexts()).map(t => t.split('\n')[0]).join(' | '));
await pick('Турник');
await p.fill('input[name="reps"]', '3'); await p.fill('input[name="value"]', '6');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('2) в тренировке:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '));

await openW(); await p.locator('[data-act="wsetedit"]').first().click(); await p.waitForTimeout(450);
console.log('3) правка подставила:', 'подходов', await p.inputValue('input[name="reps"]'), '· повторов', await p.inputValue('input[name="value"]'));
await p.fill('input[name="reps"]', '4'); await p.fill('input[name="value"]', '8');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
let s = await st();
console.log('   после правки:', (await openW(), await p.locator('.w-sets').innerText()).replace(/\n+/g, ' | '),
  '| в данных:', JSON.stringify({ reps: s.sport.workouts[0].sets[0].reps, value: s.sport.workouts[0].sets[0].value }),
  '| id подхода тот же:', s.sport.workouts[0].sets.length === 1);

// ── шаблон
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.getByText('+ Шаблон').click(); await p.waitForTimeout(450);
await p.fill('input[name="name"]', 'Ноги');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(550);
await p.getByText('+ Упражнение').click(); await p.waitForTimeout(450);
await pick('Пресс');
await p.fill('input[name="reps"]', '3'); await p.fill('input[name="value"]', '20');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('4) в шаблоне:', (await p.locator('.card').filter({ has: p.locator('[data-act="tpledit"]') }).filter({ hasText: 'Ноги' }).innerText()).replace(/\n+/g, ' | '));

await p.locator('[data-act="tplsetedit"]').first().click(); await p.waitForTimeout(450);
console.log('5) правка набора:', await p.locator('.sheet-title').innerText(), '| подходов', await p.inputValue('input[name="reps"]'), '· повторов', await p.inputValue('input[name="value"]'));
await p.fill('input[name="reps"]', '5'); await p.fill('input[name="value"]', '25');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('   после правки:', (await p.locator('.card').filter({ has: p.locator('[data-act="tpledit"]') }).filter({ hasText: 'Ноги' }).innerText()).replace(/\n+/g, ' | '));

await p.screenshot({ path: 'tpl-edit.png' });

// правленый шаблон подставляется в новую тренировку
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(450);
await p.selectOption('select[name="templateId"]', await p.locator('select[name="templateId"]').evaluate(e => [...e.options].find(o => o.text.includes('Ноги')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
s = await st();
const w = s.sport.workouts.find(x => x.title === 'Ноги');
console.log('6) из шаблона:', w.sets.map(x => `${x.reps}×${x.value}`).join(', '));

// удаление подхода из набора
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tplsetedit"]').first().click(); await p.waitForTimeout(450);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(600);
s = await st();
console.log('7) в наборе осталось:', s.sport.templates[0].sets.length, '| в тренировке осталось:', w.sets.length);
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
