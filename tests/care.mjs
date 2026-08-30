// «Забота»: ритм от последней отметки, группы, питомец, связка с днём.
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

// Списка по умолчанию больше нет: сначала берём предложенное, как это
// делает человек, и только потом проверяем механику заботы.
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(st => { st.user.sex = 'f'; st.user.birth = '1996-03-01'; st.care.pet.name = 'Бусик'; });
});
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(700);
await p.locator('[data-act="suggest"]').first().click(); await p.waitForTimeout(600);
// берём всё предложенное — так в заботе будут дела всех четырёх групп
await p.evaluate(() => document.querySelectorAll('.sheet input[type=checkbox]').forEach(x => { x.checked = true; }));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);

let s = await st();
console.log('1) взято из предложенного:', s.care.items.length, '| питомец:', s.care.pet.name);
console.log('   по группам:', ['health', 'beauty', 'home', 'pet'].map(g => `${g}: ${s.care.items.filter(i => i.group === g).length}`).join(' · '));
console.log('   «последний раз» никому не выдуман:', s.care.items.every(i => !i.last));

await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(700);
console.log('2) вкладки:', (await p.locator('.pills .pill').allInnerTexts()).join(' | '));
const now = (await p.locator('.card', { hasText: 'Пора сейчас' }).innerText()).replace(/\n+/g, ' | ');
console.log('   пора сейчас:', now.slice(0, 130));

// Отмечаем месячное дело: у годового следующий раз через год, и в «скоро»
// оно попасть не может — проверка бы ничего не значила.
const row = p.locator('.care-row').filter({ hasText: 'Маникюр' }).first();
const first = await row.locator('.care-name .ink').innerText();
await row.locator('[data-act="done"]').click(); await p.waitForTimeout(500);
console.log('3) шторка отметки:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const done = s.care.items.find(i => i.name === first);
console.log('   отмечено:', done.name, '| last:', done.last, '| в истории:', done.log.length);

// как это выглядит после отметки
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
const after = await p.locator('.card', { hasText: 'Скоро · полтора' }).innerText();
console.log('4) ушло в «скоро»:', after.includes(first) ? 'да · ' + after.split('\n').find(l => l.includes(first)) : 'нет');

// вкладка «Год» — как в её заметке
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(600);
const months = await p.locator('.card .caps').allInnerTexts();
console.log('5) год:', months.length, 'месяцев |', (await p.locator('.card', { hasText: 'Сентябрь' }).innerText()).replace(/\n+/g, ' · ').slice(0, 120));

// список по группам
await p.locator('[data-act="tab"][data-v="all"]').click(); await p.waitForTimeout(600);
console.log('6) группы на экране:', (await p.locator('.card .caps').allInnerTexts()).join(' | '));

// питомец
await p.locator('[data-act="tab"][data-v="now"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="petedit"]').first().click(); await p.waitForTimeout(500);
await p.fill('input[name="kind"]', 'собака');
await p.fill('input[name="birth"]', '2021-05-14');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
await p.locator('[data-act="weight"]').click(); await p.waitForTimeout(450);
await p.fill('input[name="kg"]', '7.4');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('7) карточка питомца:', (await p.locator('.card').filter({ has: p.locator('[data-act="petedit"]') }).innerText()).replace(/\n+/g, ' | ').slice(0, 150));

// замеры тела не дублируются
const meas = await p.locator('.care-row', { hasText: 'Замеры тела' }).count();
const linked = (await st()).care.items.find(i => i.name === 'Замеры тела');
console.log('8) замеры тела берутся из «Тела»:', linked.link === 'measure', '| строк на экране:', meas);

// «День» заботу не показывает — это отдельный раздел
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
const onDay = await p.locator('.card', { hasText: 'Пора позаботиться' }).count();
console.log('9) на «Дне» заботы нет:', onDay === 0 ? 'да' : '✗ БЛОК ОСТАЛСЯ');

console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
await p.screenshot({ path: 'care.png' });
await b.close();
