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

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
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
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(400);
await p.locator('.tile', { hasText: 'Обучение' }).click(); await p.waitForTimeout(600);
console.log('1) с плитки:', p.url().split('#')[1], '|', await p.locator('.title').first().innerText());

// практика с галочкой «и спорт»
await p.locator('[data-act="add"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'Конный спорт');
await p.fill('input[name="perMonth"]', '4');
await p.fill('input[name="place"]', 'конюшня');
await p.fill('input[name="cost"]', '12000');
await p.locator('input[name="alsoSport"]').check();
console.log('2) поле срока курса спрятано:', await p.locator('[data-when="course"]').isHidden());
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);

// вторая практика без спорта
await p.locator('[data-act="add"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'Вокал');
await p.fill('input[name="perMonth"]', '3');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);

// курс
await p.locator('[data-act="add"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'СММ-маркетинг');
await p.locator('.opts[data-name="kind"] .opt', { hasText: 'Курс' }).click(); await p.waitForTimeout(300);
console.log('   после выбора «Курс» поле ритма спрятано:', await p.locator('[data-when="practice"]').isHidden(),
  '| поле срока видно:', await p.locator('[data-when="course"]').isVisible());
await p.fill('input[name="place"]', 'Skillbox');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('3) на полке:', (await p.locator('.scr').innerText()).split('\n').filter(l => /Конный|Вокал|СММ/.test(l)).join(' | '));

// отметки занятий
const card = p.locator('.card', { hasText: 'Конный спорт' });
for (const back of [0, 3, 9]) {
  await card.locator('[data-act="mark"]').click(); await p.waitForTimeout(400);
  const d = await p.evaluate(n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0,10); }, back);
  await p.fill('input[name="date"]', d);
  if (back === 0) await p.fill('textarea[name="note"]', 'галоп без страха');
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
console.log('4) карточка практики:', (await p.locator('.card', { hasText: 'Конный спорт' }).innerText()).replace(/\n+/g, ' | '));
let s = await st();
console.log('   журнал:', Object.keys(s.lessons[0].log).sort().join(', '));
console.log('   заметка в дневнике:', s.diary[0]?.text, '|', s.diary[0]?.when);

// модули курса
await p.getByText('СММ-маркетинг').click(); await p.waitForTimeout(400);
for (const t of ['Модуль 1', 'Модуль 2']) {
  await p.getByText('+ Модуль').click(); await p.waitForTimeout(300);
  await p.fill('input[name="title"]', t);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(350);
}
await p.locator('.chk-row', { hasText: 'Модуль 1' }).locator('.check').click(); await p.waitForTimeout(400);
console.log('5) курс:', (await p.locator('.card', { hasText: 'СММ-маркетинг' }).innerText()).replace(/\n+/g, ' | ').slice(0, 100));
await p.screenshot({ path: 'edu.png' });

// трекер года подхватил строки
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
console.log('6) строки трекера:', await p.locator('.tr tbody .tr-name').allInnerTexts());
console.log('   конный спорт:', (await p.locator('.tr tbody tr', { hasText: 'Конный' }).innerText()).replace(/\s+/g, ' '));

// спорт учитывает занятия
await p.evaluate(() => { location.hash = '#/spheres/sport'; }); await p.waitForTimeout(600);
console.log('7) статы спорта:', (await p.locator('.card', { hasText: 'Статы' }).innerText()).replace(/\n+/g, ' | '));

// Летописец про забытое
await p.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  const v = s2.lessons.find(l => l.name === 'Вокал');
  const d = new Date(); d.setDate(d.getDate() - 20);
  v.log[d.toISOString().slice(0,10)] = 1;
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
console.log('8) Летописец:', (await p.locator('.scr').innerText()).split('\n').filter(l => /Вокал|не было/.test(l)).join(' | '));

// пауза
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(500);
await p.locator('.card', { hasText: 'Вокал' }).getByText('пауза').click(); await p.waitForTimeout(450);
console.log('9) после паузы:', (await p.locator('.card', { hasText: 'НА ПАУЗЕ' }).innerText()).replace(/\n+/g, ' | '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
