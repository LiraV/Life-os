// Перенос и отмена одного занятия: правило при этом не меняется.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dow = s => (new Date(s + 'T12:00').getDay() + 6) % 7;
// Ходим по дням стрелками, как человек. Раньше день записывался в состояние
// и страница перезагружалась — теперь при загрузке приложение всегда
// возвращается на сегодня, и такой обход больше не работает.
const goDay = async n => {
  await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(400);
  const cur = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).ui.date);
  const want = iso(n);
  let guard = 0;
  while (await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).ui.date) !== want && guard++ < 40) {
    const at = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).ui.date);
    await p.locator(at < want ? '[data-act="next"]' : '[data-act="prev"]').first().click();
    await p.waitForTimeout(220);
  }
  void cur;
};

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(800);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);

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

// занятие «Итальянский» с расписанием на сегодня и через неделю
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'Итальянский');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.locator('[data-act="schedadd"]').first().click(); await p.waitForTimeout(500);
await p.locator('.day-box').nth(dow(iso(0))).click(); await p.waitForTimeout(200);
await p.fill('input[name="time"]', '18:00');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
console.log('1) правило:', (await st()).schedules[0].days, '| в месяце:',
  (await p.locator('.card', { hasText: 'Итальянский' }).innerText()).split('\n').find(l => l.includes('месяце')));

// переносим сегодняшнее занятие на завтра
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
await p.locator('.quest', { hasText: 'Итальянский' }).locator('[data-act="schedmove"]').first().click(); await p.waitForTimeout(500);
console.log('2) шторка переноса:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="date"]', iso(1));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
let s = await st();
console.log('   перенос записан:', JSON.stringify(s.schedules[0].moves), '| дни правила не тронуты:', JSON.stringify(s.schedules[0].days));
console.log('3) сегодня:', await p.locator('.quest:not(.mute)', { hasText: 'Итальянский' }).count() === 0 ? 'занятия нет' : '✗ осталось',
  '| вместо него:', (await p.locator('.quest.mute', { hasText: 'Итальянский' }).innerText()).replace(/\n+/g, ' | '));

await goDay(1);
const row = p.locator('.quest', { hasText: 'Итальянский' });
console.log('4) завтра:', await row.count() ? (await row.innerText()).replace(/\n+/g, ' | ') : '✗ не приехало');

// возвращаем на место
await row.locator('[data-act="schedmove"]').first().click(); await p.waitForTimeout(500);
console.log('5) кнопка возврата:', await p.locator('[data-sheet="secondary"]').innerText());
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(800);
s = await st();
console.log('   переносов не осталось:', JSON.stringify(s.schedules[0].moves), '| завтра пусто:', await p.locator('.quest', { hasText: 'Итальянский' }).count() === 0);

// отменяем одно занятие
await goDay(0);
await p.locator('.quest', { hasText: 'Итальянский' }).locator('[data-act="schedmove"]').first().click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(800);
s = await st();
console.log('6) отмена:', JSON.stringify(s.schedules[0].moves), '| строка на дне:',
  (await p.locator('.quest.mute', { hasText: 'Итальянский' }).innerText()).replace(/\n+/g, ' | '));
await p.locator('.quest.mute', { hasText: 'Итальянский' }).locator('[data-act="schedback"]').click(); await p.waitForTimeout(700);
console.log('   вернула:', JSON.stringify((await st()).schedules[0].moves), '| занятие снова на дне:',
  await p.locator('.quest:not(.mute)', { hasText: 'Итальянский' }).count() === 1);

// через неделю занятие всё равно есть — правило живо
await goDay(7);
console.log('7) через неделю:', await p.locator('.quest', { hasText: 'Итальянский' }).count() ? 'занятие на месте — правило не сломано' : '✗ пропало');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
