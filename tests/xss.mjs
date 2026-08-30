import { chromium } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  viewport: { width: 400, height: 900 }, locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
let alerted = false;
p.on('dialog', d => { alerted = true; d.dismiss(); });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
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
await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' }); await p.waitForTimeout(400);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(300);
await p.getByText('+ Цель года').click(); await p.waitForTimeout(300);
await p.fill('input[name="title"]', '<img src=x onerror=alert(1)> "кав" & <b>жир</b>');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);

const probe = await p.evaluate(() => ({
  badImg: [...document.querySelectorAll('img')].filter(i => !i.src.includes('illustration')).map(i => i.getAttribute('src')),
  bold: document.querySelectorAll('#scr b, .sheet b').length,
  legitBold: document.querySelectorAll('#scr .ink b').length,
}));
console.log('чужих <img>:', probe.badImg.length ? probe.badImg : 'нет');
console.log('alert сработал:', alerted);
// теперь то же самое в квесте («зачем») и в шторке цели
await p.goto('http://127.0.0.1:8765/#/day', { waitUntil: 'load' }); await p.waitForTimeout(400);
await p.getByText('+ Добавить квест').click(); await p.waitForTimeout(300);
const optText = await p.locator('select[name="goalId"]').evaluate(e => [...e.options].map(o => o.text).join('|'));
console.log('цель в списке квеста:', JSON.stringify(optText.slice(0, 60)));
const inSheet = await p.evaluate(() => [...document.querySelectorAll('.sheet img, .sheet b')].length);
console.log('разметка в шторке из названия:', inSheet === 0 ? 'нет' : 'ЕСТЬ');
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
