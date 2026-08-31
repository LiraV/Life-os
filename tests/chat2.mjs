// Отправка сообщения в чат. Экран обязан перерисоваться сразу: реплика
// человека и ответ должны появиться, даже если фокус остался в поле ввода.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.route(/api\.openai\.com/, r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content: 'Слышу тебя.' } }] }),
}));
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.ui.insideTab = 'chat';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  localStorage.setItem('lifeos.openai.key', 'sk-test-0123456789012345678901234567890');
  location.hash = '#/inside';
  location.reload();
});
await p.waitForTimeout(1000);

const box = p.locator('#scr [data-field="ask"]');
ok('поле ввода на месте', await box.count() === 1);
await box.click();
await box.fill('привет');
// Фокус нарочно остаётся в поле: на телефоне тап по кнопке его не всегда
// забирает, и экран обязан перерисоваться всё равно.
await p.evaluate(() => {
  document.querySelector('#scr [data-field="ask"]').focus();
  document.querySelector('#scr [data-act="ask"]').click();
});
await p.waitForTimeout(1400);
ok('фокус остался в поле', await p.evaluate(() => document.activeElement?.dataset?.field === 'ask'));

const seen = await p.locator('#scr').innerText();
ok('реплика человека появилась на экране', /привет/i.test(seen), seen.slice(0, 120).replace(/\n/g, ' · '));
ok('ответ появился на экране', /Слышу тебя/i.test(seen), seen.slice(0, 160).replace(/\n/g, ' · '));
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).chat.map(x => x.who));
ok('в данных обе реплики', saved.join(',') === 'me,ai', saved.join(','));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ чат отправляет и показывает');
process.exit(bad ? 1 : 0);
