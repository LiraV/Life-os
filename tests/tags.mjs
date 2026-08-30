// Пилюли тренировок: в трекере года считаются они, а не упражнения.
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
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(1200);
await p.locator('[data-sheet="secondary"]').click({ timeout: 2500 }).catch(() => {});
await p.waitForTimeout(300);

let s = await st();
console.log('1) пилюли из коробки:', s.sport.tags.map(t => t.name).join(', '));
console.log('   «Растяжки» нет, есть «Шпагат»:', !s.sport.tags.some(t => t.name === 'Растяжка') && s.sport.tags.some(t => t.name === 'Шпагат'));

// тренировка на дне с двумя пилюлями
await p.getByText('+ тренировка').click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Дом · утро');
const pressId = s.sport.tags.find(t => t.name === 'Пресс').id;
const armsId = s.sport.tags.find(t => t.name === 'Руки').id;
await p.locator(`input[name="tag_${pressId}"]`).locator('xpath=..').click(); await p.waitForTimeout(150);
await p.locator(`input[name="tag_${armsId}"]`).locator('xpath=..').click(); await p.waitForTimeout(150);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
console.log('2) у тренировки пилюли:', s.sport.workouts[0].tags.length, '| на строке дня:',
  (await p.locator('.quest', { hasText: 'Дом · утро' }).innerText()).replace(/\n+/g, ' | '));

// пока не отмечена — в трекере её нет
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
console.log('3) неотмеченная в трекер не идёт:', await p.locator('.tr-name', { hasText: 'Пресс' }).count() === 0);

// отмечаем — появляется строка «Пресс»
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('.quest', { hasText: 'Дом · утро' }).locator('[data-act="wdone"]').click(); await p.waitForTimeout(900);
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
const names = await p.locator('.tr-name').allInnerTexts();
console.log('4) строки трекера:', names.join(' / '));
console.log('   упражнений среди них нет:', !names.some(n => /Планка|Турник|Шпагат/.test(n)));
console.log('   строка «Пресс»:', (await p.locator('.tr tbody tr', { hasText: 'Пресс' }).innerText()).replace(/\s+/g, ' '));

// вторая тренировка того же дня-месяца — счёт растёт
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Дом · вечер');
await p.locator(`input[name="tag_${pressId}"]`).locator('xpath=..').click(); await p.waitForTimeout(150);
await p.locator('input[name="done"]').check();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
console.log('5) после второй:', (await p.locator('.tr tbody tr', { hasText: 'Пресс' }).innerText()).replace(/\s+/g, ' '));

// новая пилюля прямо из шторки тренировки
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(500);
await p.fill('input[name="title"]', 'Бассейн');
await p.fill('input[name="newtag"]', 'Плавание');
await p.locator('input[name="done"]').check();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
s = await st();
console.log('6) новая пилюля завелась:', s.sport.tags.some(t => t.name === 'Плавание'),
  '| у тренировки:', s.sport.workouts.find(w => w.title === 'Бассейн').tags.length);

// переименование пилюли не рвёт историю
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(700);
await p.locator('.chip', { hasText: 'Пресс' }).click(); await p.waitForTimeout(500);
await p.fill('input[name="name"]', 'Пресс и кор');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
console.log('7) после переименования:', (await p.locator('.tr tbody tr', { hasText: 'Пресс и кор' }).innerText()).replace(/\s+/g, ' '));

// ручная правка месяца
await p.locator('.tr tbody tr', { hasText: 'Пресс и кор' }).locator('td.edit').first().click(); await p.waitForTimeout(500);
console.log('8) правка ячейки:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
await p.fill('input[name="n"]', '9');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
console.log('   записалось:', (await p.locator('.tr tbody tr', { hasText: 'Пресс и кор' }).innerText()).replace(/\s+/g, ' '));
console.log('ошибки:', errs.length ? errs : 'нет');
await p.screenshot({ path: 'tags.png' });
await b.close();
