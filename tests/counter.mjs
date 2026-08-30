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
const goal = async t => (await state()).goals.find(g => g.title.includes(t));

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

// 1. новая сфера
await p.goto('http://127.0.0.1:8765/#/spheres', { waitUntil: 'load' }); await p.waitForTimeout(500);
const tiles = await p.locator('.tile b').allInnerTexts();
console.log('1) сферы:', tiles.join(', '));
await p.locator('.tile', { hasText: 'Учёба' }).click(); await p.waitForTimeout(400);
console.log('   открылась:', (await p.locator('.title').first().innerText()), '| механика:', await p.locator('.tag').first().innerText());
await p.screenshot({ path: 'spheres7.png' });

// 2. цель-счётчик: книги
await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' }); await p.waitForTimeout(400);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(300);
await p.getByText('+ Цель года').click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Прочитать 12 книг');
await p.fill('input[name="target"]', '12');
await p.fill('input[name="unit"]', 'книг');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('2) карточка:', (await p.locator('.card', { hasText: 'Прочитать 12 книг' }).innerText()).replace(/\n+/g, ' | '));
for (let i = 0; i < 3; i++) { await p.locator('[data-act="cnt"][data-d="1"]').first().click(); await p.waitForTimeout(220); }
let g = await goal('Прочитать');
console.log('   после трёх +1:', g.current, 'из', g.target, '| прогресс:',
  (await p.locator('.card', { hasText: 'Прочитать' }).locator('.lab').filter({ hasText: '%' }).first().innerText()));
await p.locator('[data-act="cnt"][data-d="-1"]').first().click(); await p.waitForTimeout(300);
console.log('   после −1:', (await goal('Прочитать')).current);

// 3. крупный счётчик: деньги
await p.getByText('+ цель').first().click(); await p.waitForTimeout(350);
await p.fill('input[name="title"]', 'Накопить на Милан');
await p.fill('input[name="target"]', '150000');
await p.fill('input[name="unit"]', '₽');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
const moneyCard = await p.locator('.card', { hasText: 'Накопить на Милан' }).innerText();
console.log('3) деньги:', moneyCard.replace(/\n+/g, ' | '));
console.log('   кнопок ±1 нет:', !moneyCard.includes('+1'));
await p.locator('.card', { hasText: 'Накопить на Милан' }).locator('[data-act="cntadd"]').click(); await p.waitForTimeout(350);
await p.fill('input[name="n"]', '30000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
g = await goal('Накопить');
console.log('   после пополнения:', g.current, '| на экране:',
  (await p.locator('.card', { hasText: 'Накопить' }).innerText()).split('\n').find(l => l.includes('из')));

// 4. достижение цели
await p.locator('.card', { hasText: 'Накопить на Милан' }).locator('[data-act="cntadd"]').click(); await p.waitForTimeout(350);
await p.fill('input[name="n"]', '120000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('4) при достижении:', await p.locator('.toast').innerText().catch(() => 'тоста нет'));
console.log('   строка:', (await p.locator('.card', { hasText: 'Накопить' }).innerText()).split('\n').find(l => l.includes('из')));

// 5. вычеркнутая цель остаётся в расчётах
await p.locator('.card', { hasText: 'Прочитать 12 книг' }).getByText('изменить ›').click(); await p.waitForTimeout(350);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(600);
const yearPct = (await p.locator('.scr').innerText()).split('\n').filter(l => /Год целиком/.test(l));
g = await goal('Прочитать');
console.log('5) вычеркнута:', g.dropped, '| прогресс цели сохранён:',
  (await p.locator('.card', { hasText: 'Прочитать' }).locator('.lab').filter({ hasText: '%' }).first().innerText()));
console.log('   год целиком:', (await p.locator('.card', { hasText: 'ТЕМА ГОДА' }).innerText()).replace(/\n+/g, ' | '));
console.log('   (2 книги из 12 = 17%, деньги 100% → среднее 59%, вычеркнутая в расчёте)');
await p.screenshot({ path: 'counter.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
