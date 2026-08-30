// Подсказки: предлагаются после онбординга, показываются по разу на экран,
// от них можно отказаться — и вернуть в настройках.
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
const go = async r => { await p.evaluate(h => { location.hash = '#/' + h; }, r); await p.waitForTimeout(600); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(800);
console.log('1) до онбординга предложения нет:', await p.locator('.sheet-title').count() === 0);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(1400);
console.log('2) после онбординга:', await p.locator('.sheet-title').innerText(), '|', (await p.locator('.sheet-actions').innerText()).replace(/\n+/g, ' | '));

// отказ запоминается
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(600);
console.log('3) отказ:', (await st()).ui.tips, '| карточек на дне:', await p.locator('.card.tip').count());
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200);
console.log('   после перезапуска не спрашивает снова:', await p.locator('.sheet-title').count() === 0);

// возвращаем через настройки
await go('settings');
await p.locator('[data-act="tips"]').click(); await p.waitForTimeout(700);
console.log('4) вернула через настройки:', (await st()).ui.tips, '|', (await p.locator('.card:not(.tip)', { hasText: 'ПОДСКАЗКИ' }).innerText()).replace(/\n+/g, ' | '));

// карточка появляется на каждом экране по разу
await go('day');
const tip = p.locator('.card.tip');
console.log('5) на «Дне»:', (await tip.innerText()).replace(/\n+/g, ' | ').slice(0, 120));
await tip.locator('[data-act="tipok"]').click(); await p.waitForTimeout(600);
console.log('   после «Понятно»:', await p.locator('.card.tip').count() === 0 ? 'ушла' : '✗ осталась');
await go('plans'); console.log('6) на «Планах» своя:', (await p.locator('.card.tip .caps').innerText()));
await go('day'); console.log('   на «Дне» больше не возвращается:', await p.locator('.card.tip').count() === 0);

// «не показывать» гасит всё разом
await go('care');
await p.locator('.card.tip [data-act="tipoff"]').click(); await p.waitForTimeout(600);
console.log('7) «не показывать»:', (await st()).ui.tips, '| на care:', await p.locator('.card.tip').count());
await go('sport'); console.log('   и на других экранах:', await p.locator('.card.tip').count() === 0 ? 'пусто' : '✗ есть');

// экраны, у которых есть текст
const covered = await p.evaluate(async () => Object.keys((await import('/app/js/tips.js')).TIPS));
console.log('8) экранов с подсказкой:', covered.length, '·', covered.join(', '));
console.log('ошибки:', errs.length ? errs : 'нет');
await go('settings'); await p.locator('[data-act="tips"]').click(); await p.waitForTimeout(500);
await go('day'); await p.screenshot({ path: 'tips.png' });
await b.close();
