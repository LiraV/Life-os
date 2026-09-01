import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const today = new Date().toISOString().slice(0, 10);
const ym = today.slice(0, 7);

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

// заводим занятие и «дубли» из старой таблицы
await p.evaluate(({ ym }) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.lessons = [{ id: 'L1', name: 'Конный спорт', kind: 'practice', perMonth: 4, step: 1,
    alsoSport: true, paused: false, log: {}, items: [], cost: 0 }];
  s.tracker.rows = [
    { id: 'R1', name: 'Лошадки', unit: 'раз' },
    { id: 'R2', name: 'Конный спорт', unit: '' },
  ];
  s.tracker.values = { R1: { '2026-01': 2, '2026-02': 4 }, R2: { '2026-03': 3 } };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, { ym });
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);

console.log('1) строк до объединения:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('   подсказка про дубль:', (await p.locator('.card.dash', { hasText: 'дублируется' }).innerText().catch(() => '—')).replace(/\n+/g, ' | ').slice(0, 120));

// точное совпадение имени — объединяем кнопкой
await p.getByText('Объединить').click(); await p.waitForTimeout(600);
let s = await st();
console.log('2) после объединения по имени:', await p.locator('.toast').innerText().catch(() => '—'));
console.log('   строк:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('   правки занятия:', JSON.stringify(s.tracker.lessonValues));

// «Лошадки» — другое имя, связываем вручную
await p.locator('.tr-name.own', { hasText: 'Лошадки' }).click(); await p.waitForTimeout(500);
const opts = await p.locator('select[name="merge"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
console.log('3) варианты связывания:', opts);
await p.selectOption('select[name="merge"]', await p.locator('select[name="merge"]').evaluate(e => [...e.options].find(o => o.text.includes('Конный спорт')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
console.log('   после связывания:', await p.locator('.toast').innerText().catch(() => '—'));
console.log('   строк:', (await p.locator('.tr tbody .tr-name').allInnerTexts()).join(' / '));
console.log('   значения переехали:', JSON.stringify(s.tracker.lessonValues.L1), '| своих строк:', s.tracker.rows.length);
console.log('   в таблице:', (await p.locator('.tr tbody tr', { hasText: 'Конный' }).innerText()).replace(/\s+/g, ' '));
await p.screenshot({ path: 'link-tracker.png' });

// квест, привязанный к занятию
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ Добавить квест').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Конюшня в 18:00');
// Полка в квесте — одно поле: практики, курсы целиком и уроки курсов.
const lessonSel = await p.locator('select[name="shelf"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
console.log('4) выбор занятия в квесте:', lessonSel);
await p.selectOption('select[name="shelf"]', await p.locator('select[name="shelf"]').evaluate(e => [...e.options].find(o => o.text.trim() === 'Конный спорт').value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('   строка квеста:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));
s = await st();
console.log('   сфера проставилась сама:', s.quests[Object.keys(s.quests)[0]][0].sphere);

// отмечаем квест — занятие должно засчитаться
await p.locator('.quest .check').click(); await p.waitForTimeout(700);
s = await st();
console.log('5) после отметки квеста журнал занятия:', JSON.stringify(s.lessons[0].log));
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(600);
console.log('   на полке:', (await p.locator('.card', { hasText: 'Конный спорт' }).innerText()).replace(/\n+/g, ' | ').slice(0, 90));
await p.evaluate(() => { location.hash = '#/spheres/sport'; }); await p.waitForTimeout(600);
console.log('   в спорте:', (await p.locator('.card', { hasText: 'Статы' }).innerText()).split('\n').filter(l => /Тренировки|Считается/.test(l)).join(' | '));

// снимаем отметку — занятие должно уйти
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('.quest .check').click(); await p.waitForTimeout(700);
s = await st();
console.log('6) после снятия отметки журнал:', JSON.stringify(s.lessons[0].log), '(пусто — верно)');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
