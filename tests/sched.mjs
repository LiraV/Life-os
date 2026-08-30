// Расписание: опционально, у занятия/предмета/шаблона, события считаются на лету.
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
const dow = iso => (new Date(iso + 'T12:00').getDay() + 6) % 7;
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

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

// заводим занятие с полки
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.getByText('+ Занятие').first().click().catch(() => p.locator('[data-act="add"]').first().click());
await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'Вокал');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
console.log('1) без расписания:', (await p.locator('.card', { hasText: 'Вокал' }).innerText()).includes('Пусто') ? 'сказано, что это нормально' : '✗ нет блока');

// расписание на сегодня
await p.locator('[data-act="schedadd"]').first().click(); await p.waitForTimeout(500);
console.log('2) шторка правила:', await p.locator('.sheet-title').innerText(), '| дней в выборе:', await p.locator('.day-box').count());
await p.locator('.day-box').nth(dow(iso(0))).click(); await p.waitForTimeout(200);
await p.fill('input[name="time"]', '19:30');
await p.fill('input[name="dur"]', '60');
await p.fill('input[name="place"]', 'студия на Мира');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
console.log('   правило:', JSON.stringify({ kind: s.schedules[0].kind, days: s.schedules[0].days, time: s.schedules[0].time, every: s.schedules[0].every }));
console.log('   в карточке:', (await p.locator('.card', { hasText: 'Вокал' }).innerText()).split('\n').find(l => l.includes('19:30')));

// событие на дне
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
const row = p.locator('.quest', { hasText: 'Вокал' });
console.log('3) на дне сегодня:', (await row.innerText()).replace(/\n+/g, ' | '));

// завтра его быть не должно
await p.locator('[data-act="next"]').first().click(); await p.waitForTimeout(600);
console.log('4) завтра:', await p.locator('.quest', { hasText: 'Вокал' }).count() === 0 ? 'события нет — верно' : '✗ есть');
await p.locator('[data-act="prev"]').first().click(); await p.waitForTimeout(600);

// отметка пишется в полку занятий, а не в отдельную галочку
await p.locator('.quest', { hasText: 'Вокал' }).locator('[data-act="scheddone"]').click(); await p.waitForTimeout(700);
s = await st();
const l = s.lessons[0];
console.log('5) отметка ушла в занятие:', JSON.stringify(l.log), '| строка:', (await p.locator('.quest', { hasText: 'Вокал' }).innerText()).replace(/\n+/g, ' | '));
await p.locator('.quest', { hasText: 'Вокал' }).locator('[data-act="scheddone"]').click(); await p.waitForTimeout(700);
console.log('   снялась:', Object.keys((await st()).lessons[0].log).length === 0);

// расписание тренировки — создаёт настоящую тренировку дня
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(700);
await p.getByText('+ Шаблон').click(); await p.waitForTimeout(450);
await p.fill('input[name="name"]', 'Зал А');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
await p.locator('[data-act="schedadd"]').first().click(); await p.waitForTimeout(500);
await p.locator('.day-box').nth(dow(iso(0))).click(); await p.waitForTimeout(200);
await p.fill('input[name="time"]', '08:00');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
console.log('6) тренировка по расписанию:', (await p.locator('.quest', { hasText: 'Зал А' }).innerText()).replace(/\n+/g, ' | '));
await p.locator('.quest', { hasText: 'Зал А' }).locator('[data-act="scheddone"]').click(); await p.waitForTimeout(800);
s = await st();
console.log('7) появилась настоящая тренировка:', s.sport.workouts.length, '| строка расписания ушла:', await p.locator('[data-act="scheddone"]').count() === 1);

// пауза
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(700);
await p.locator('[data-act="schededit"]').first().click(); await p.waitForTimeout(500);
await p.locator('input[name="off"]').check();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
console.log('8) на паузе на дне:', await p.locator('.quest', { hasText: 'Вокал' }).count() === 0 ? 'скрыто' : '✗ видно');
console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/edu'; }); await p.waitForTimeout(600);
await p.screenshot({ path: 'sched.png' });
await b.close();
