// Вкладки живут в адресе: по ссылке попадаешь на нужную, перезагрузка её не
// теряет, а «назад» уводит с экрана, а не перебирает вкладки.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const ready = () => p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
const hash = () => p.evaluate(() => location.hash);
const go = async h => { await p.evaluate(x => { location.hash = x; }, h); await p.waitForFunction(x => location.hash === x, h, { timeout: 20000 }); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await ready();

// Тап по вкладке пишет её в адрес
await go('#/budget');
await p.getByRole('button', { name: 'Копилки', exact: true }).click();
await p.waitForFunction(() => location.hash === '#/budget/vaults', null, { timeout: 10000 }).catch(() => {});
ok('вкладка попала в адрес', (await hash()) === '#/budget/vaults', await hash());

// Перезагрузка не теряет вкладку
await p.reload({ waitUntil: 'load' }); await ready();
ok('перезагрузка оставила вкладку', (await hash()) === '#/budget/vaults', await hash());
ok('и показывает именно её', await p.getByRole('button', { name: 'Копилки', exact: true }).evaluate(e => e.classList.contains('on')));

// Прямая ссылка на вкладку
await p.goto('http://127.0.0.1:8765/#/work/board', { waitUntil: 'load' }); await ready();
ok('прямая ссылка открыла «Доску»', await p.getByRole('button', { name: 'Доска', exact: true }).evaluate(e => e.classList.contains('on')));
ok('доска сразу во всю ширину', await p.evaluate(() => document.getElementById('app').classList.contains('wide')));

// Вкладки не копят историю: «назад» уводит с экрана
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await ready();
await go('#/work');
for (const n of ['Доска', 'Путь', 'Год']) {
  await p.getByRole('button', { name: n, exact: true }).first().click();
  await p.waitForTimeout(200);
}
ok('вкладки прошлись', (await hash()) === '#/work/year', await hash());
await p.click('[data-act="back"]'); await p.waitForTimeout(400);
ok('«назад» ушёл с экрана, а не на прошлую вкладку', (await hash()) === '#/day', await hash());

// Память вкладки жива: вход без вкладки возвращает на последнюю
await go('#/work');
ok('вход без вкладки вернул на последнюю', await p.getByRole('button', { name: 'Год', exact: true }).evaluate(e => e.classList.contains('on')));

// Неизвестная вкладка не роняет экран
await go('#/budget/no-such-tab');
ok('неизвестная вкладка не сломала экран', (await p.locator('.title').first().innerText()).trim() === 'Бюджет', await p.locator('.title').first().innerText());

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ вкладки живут в адресе');
process.exit(bad ? 1 : 0);
