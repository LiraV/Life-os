// Настоящее касание: ползунок энергии обязан тянуться, экран — нет.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
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

const drag = async (from, to, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 6, y }] });
    await p.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(400);
};

const box = await p.locator('input[type=range][data-act-input="energyLive"]').boundingBox();
const before = Number(await p.locator('input[type=range][data-act-input="energyLive"]').inputValue());
// Тянем в сторону, противоположную нынешнему значению: подсказка по хронотипу
// зависит от времени суток, и фиксированная цель делала тест плавающим.
const target = before > 50 ? 0.1 : 0.9;
await drag(box.x + box.width * 0.5, box.x + box.width * target, box.y + box.height / 2);
const after = Number(await p.locator('input[type=range][data-act-input="energyLive"]').inputValue());
const near = Math.abs(after - target * 100) <= 8;
console.log('1) ползунок энергии:', before, '→', after, `(тянули к ${target * 100})`, near ? '✓ тянется' : '✗ НЕ ТЯНЕТСЯ');

const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
console.log('   записалось в состояние:', Object.values(st.energy)[0] ?? '—');

// экран не должен уезжать вбок от горизонтального свайпа
const scrBox = await p.locator('.scr').boundingBox();
await drag(scrBox.x + scrBox.width * 0.8, scrBox.x + 20, scrBox.y + scrBox.height * 0.75);
const moved = await p.evaluate(() => ({ scr: document.querySelector('.scr').scrollLeft, doc: window.scrollX }));
console.log('2) после свайпа вбок по экрану:', JSON.stringify(moved), moved.scr === 0 && moved.doc === 0 ? '✓ стоит на месте' : '✗ УЕХАЛ');

// а таблица года — обязана ехать
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
const tb = await p.locator('.tr-wrap').boundingBox();
await drag(tb.x + tb.width * 0.8, tb.x + 20, tb.y + tb.height * 0.5);
const trLeft = await p.evaluate(() => document.querySelector('.tr-wrap').scrollLeft);
console.log('3) таблица года после свайпа: scrollLeft', Math.round(trLeft), trLeft > 0 ? '✓ едет' : '✗ НЕ ЕДЕТ');
await b.close();
