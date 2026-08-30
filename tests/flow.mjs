import { chromium } from './pw.mjs';
const b = await chromium.launch();
// Ждём, пока все картинки на странице решатся — загрузятся или не смогут.
// Проверять naturalWidth сразу нельзя: под нагрузкой картинка ещё в пути, и
// набор мигает на ровном месте.
const imagesSettled = pg => pg.evaluate(() => Promise.all([...document.images].map(i => (
  i.complete ? null : new Promise(r => {
    i.addEventListener('load', r, { once: true });
    i.addEventListener('error', r, { once: true });
    setTimeout(r, 15000);
  })
))).then(() => true));


const ctx = await b.newContext({ serviceWorkers: 'block',  viewport: { width: 900, height: 940 } });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [], bad = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts.googleapis/.test(m.text())) errs.push(m.text()); });
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await p.goto('http://127.0.0.1:8765/Prototype.dc.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);

await p.getByText('пропустить онбординг').click();

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
await p.waitForTimeout(600);
console.log('after skip, header:', (await p.locator('.hft').first().innerText()).replace(/\n/g,' '));

// open drawer -> Сферы
await p.getByText('☰ Ещё').click();
await p.waitForTimeout(500);
await p.getByText('Сферы', { exact: false }).first().click();
await p.waitForTimeout(700);
await imagesSettled(p);
const imgs = await p.evaluate(() => [...document.images].map(i => ({ s: i.getAttribute('src'), ok: i.naturalWidth > 0 })));
console.log('sphere images:', JSON.stringify(imgs));
await p.screenshot({ path: 'spheres.png' });

console.log('errors:', errs.length ? errs : 'none');
console.log('http>=400:', bad.length ? bad : 'none');
await b.close();
