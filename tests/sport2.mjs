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
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);

// свой шаблон с набором
await p.locator('[data-act="tab"][data-v="tpl"]').click(); await p.waitForTimeout(500);
console.log('1) шаблонов из коробки:', (await p.locator('.card:not(.mute) .ink b').allInnerTexts()).join(', ') || 'нет');
await p.getByText('+ Шаблон').click(); await p.waitForTimeout(450);
await p.fill('input[name="name"]', 'Зал А · ноги');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(550);
const kid = (await st()).sport.templates.find(k => k.name.includes('Зал А')).id;
for (const [ex, val, reps] of [['Планка', '45', '3'], ['Пресс', '20', '4']]) {
  await p.locator(`[data-act="tplsetadd"][data-id="${kid}"]`).click(); await p.waitForTimeout(400);
  await p.selectOption('select[name="exerciseId"]', await p.locator('select[name="exerciseId"]').evaluate((e, n) => [...e.options].find(o => o.text.startsWith(n)).value, ex));
  await p.fill('input[name="value"]', val); await p.fill('input[name="reps"]', reps);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
console.log('2) шаблон:', (await p.locator('.card:not(.mute)', { hasText: 'Зал А' }).innerText()).replace(/\n+/g, ' | '));
console.log('   дат на экране нет:', !/\d{1,2}\s(январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(await p.locator('.scr').innerText()));

// тренировка на дне подставляет состав шаблона
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(450);
await p.selectOption('select[name="templateId"]', kid);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
let s = await st();
console.log('3) набор подставился сам:', s.sport.workouts[0].sets.map(x => `${x.reps}×${x.value}`).join(', '),
  '| название из шаблона:', s.sport.workouts[0].title);

// удаление шаблона не трогает уже созданные тренировки
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(600);
await p.locator('.card:not(.mute)', { hasText: 'Зал А' }).getByText('изменить ›').click(); await p.waitForTimeout(450);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(600);
s = await st();
console.log('4) после удаления шаблона:', await p.locator('.toast').innerText().catch(() => '—'),
  '| тренировка на месте:', s.sport.workouts.length === 1 && s.sport.workouts[0].sets.length === 2);

// оба края у упражнения
await p.locator('[data-act="tab"][data-v="ex"]').click(); await p.waitForTimeout(500);
for (const [v, d] of [['40', iso(-50)], ['60', iso(-20)], ['52', iso(0)]]) {
  await p.locator('.card:not(.mute)', { hasText: 'Планка' }).getByText('+ Результат').click(); await p.waitForTimeout(400);
  await p.fill('input[name="value"]', v); await p.fill('input[name="date"]', d);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
}
console.log('5) планка (больше лучше):', (await p.locator('.card:not(.mute)', { hasText: 'Планка' }).innerText()).replace(/\n+/g, ' | ').slice(0, 140));

// переключаем на «меньше лучше» — рекорд должен смениться
await p.locator('.card:not(.mute)', { hasText: 'Планка' }).getByText('изменить ›').click(); await p.waitForTimeout(450);
await p.locator('.opts[data-name="dir"] .opt', { hasText: 'Меньше лучше' }).click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('6) после «меньше лучше»:', (await p.locator('.card:not(.mute)', { hasText: 'Планка' }).innerText()).replace(/\n+/g, ' | ').slice(0, 130));

// «важны оба»
await p.locator('.card:not(.mute)', { hasText: 'Планка' }).getByText('изменить ›').click(); await p.waitForTimeout(450);
await p.locator('.opts[data-name="dir"] .opt', { hasText: 'Важны оба' }).click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('7) «важны оба»:', (await p.locator('.card:not(.mute)', { hasText: 'Планка' }).innerText()).replace(/\n+/g, ' | ').slice(0, 130));
await p.screenshot({ path: 'sport-flex.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
