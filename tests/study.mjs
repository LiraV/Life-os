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
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

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
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(400);
await p.locator('.tile', { hasText: 'Учёба' }).click(); await p.waitForTimeout(600);
console.log('1) с плитки:', p.url().split('#')[1], '|', (await p.locator('.scr').innerText()).split('\n').slice(0, 3).join(' | '));

// заведение и предметы
await p.getByText('+ Заведение').click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'EU Business School');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
await p.getByText('+ Предмет').click(); await p.waitForTimeout(400);
await p.fill('input[name="name"]', 'Диплом');
await p.fill('input[name="teacher"]', 'научрук Иванова');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('2) предмет создан:', (await p.locator('.card', { hasText: 'EU Business School' }).innerText()).replace(/\n+/g, ' | ').slice(0, 90));

// этапы диплома
const sid = (await st()).study.subjects[0].id;
for (const [title, due] of [['Глава 1', iso(-3)], ['Глава 2 · черновик', iso(5)], ['Глава 3', iso(40)]]) {
  await p.locator(`[data-act="taskadd"][data-id="${sid}"]`).click(); await p.waitForTimeout(400);
  await p.fill('input[name="title"]', title);
  await p.fill('input[name="due"]', due);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
console.log('3) этапов:', (await st()).study.tasks.length);

// доска: двигаем стадии
await p.locator('[data-act="tab"][data-v="board"]').click(); await p.waitForTimeout(500);
console.log('4) колонок на доске:', await p.locator('.board-col').count(),
  '| прокручивается вбок:', await p.locator('.board').evaluate(e => e.scrollWidth > e.clientWidth));
console.log('   первая колонка:', (await p.locator('.board-col').first().innerText()).replace(/\n+/g, ' | ').slice(0, 100));
// «Глава 2» до стадии «у преподавателя»
for (let i = 0; i < 3; i++) {
  await p.locator('.board-card', { hasText: 'Глава 2' }).locator('[data-act="next"]').click();
  await p.waitForTimeout(350);
}
let s = await st();
const g2 = s.study.tasks.find(t => t.title.includes('Глава 2'));
console.log('5) после трёх «дальше»:', g2.stage, '| дата отправки записана:', !!g2.stageAt);
await p.screenshot({ path: 'study-board.png' });

// вкладка «сейчас»
await p.locator('[data-act="tab"][data-v="now"]').click(); await p.waitForTimeout(500);
const now = await p.locator('.scr').innerText();
console.log('6) «Сейчас»:', now.split('\n').filter(l => /ПРОСРОЧ|ЖДЁТ|БЛИЖАЙШ|В РАБОТЕ|Глава/.test(l)).join(' | '));
await p.screenshot({ path: 'study-now.png' });

// этап становится целью месяца
await p.locator('[data-act="open"]').first().click(); await p.waitForTimeout(450);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(600);
s = await st();
console.log('7) цель месяца:', s.goals.map(g => `${g.title} · ${g.horizon} ${g.period} · сфера ${g.sphere}`).join(', '));

// Летописец и плитка
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
console.log('8) Летописец:', (await p.locator('.ai').allInnerTexts()).filter(x => /Глава|преподавател|просроч/.test(x)).join(' // ').slice(0, 160));
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(500);
console.log('9) плитка «Учёба»:', (await p.locator('.tile', { hasText: 'Учёба' }).innerText()).replace(/\n+/g, ' | '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
