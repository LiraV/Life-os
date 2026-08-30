import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);

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

// 1. до касания — честная подпись
console.log('1) подпись до отметки:', await p.locator('#e_out').innerText());
console.log('   подсказка видна:', (await p.locator('.card', { hasText: 'Кривая дня' }).innerText()).includes('Пока это подсказка'));
console.log('   в состоянии энергии нет:', Object.keys((await st()).energy).length === 0);

// 2. запись в момент движения, без отпускания
const slider = p.locator('input[type=range][data-act-input="energyLive"]');
await slider.evaluate(el => {
  el.value = 72;
  el.dispatchEvent(new Event('input', { bubbles: true }));   // только input, change не шлём
});
await p.waitForTimeout(400);
let s = await st();
console.log('2) после одного input (без отпускания):', JSON.stringify(s.energy), '| подпись:', await p.locator('#e_out').innerText());
console.log('   экран не перерисовался, ползунок жив:', await slider.count() === 1, '| значение:', await slider.inputValue());

// отпускание обновляет совет
await slider.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await p.waitForTimeout(500);
console.log('3) после отпускания совет:', (await p.locator('.ai').first().innerText()).slice(0, 60));
console.log('   подсказка про хронотип ушла:', !(await p.locator('.card', { hasText: 'Кривая дня' }).innerText()).includes('Пока это подсказка'));

// 3. история: засеем 40 дней с циклом и занятиями
await p.evaluate(() => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
  s2.energy = {};
  for (let i = 0; i < 60; i++) {
    const day = i % 28;
    // низкая энергия в первые дни цикла, высокая в середине
    let base = day < 5 ? 30 : day < 14 ? 70 : day < 18 ? 85 : 55;
    if (i % 3 === 0) base += 12;                       // дни с занятиями
    s2.energy[iso(i)] = Math.max(5, Math.min(100, base + ((i * 7) % 9) - 4));
  }
  s2.health.days = {};
  [0, 28, 56].forEach(off => { for (let k = 0; k < 5; k++) s2.health.days[iso(off + k)] = true; });
  s2.lessons = [{ id: 'l1', name: 'Вокал', kind: 'practice', perMonth: 4, step: 1, log: {}, items: [], cost: 0 }];
  for (let i = 0; i < 60; i += 3) s2.lessons[0].log[iso(i)] = 1;
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
console.log('4) график:', await p.locator('.spark i').count(), 'столбцов |',
  (await p.locator('.card', { hasText: 'Кривая дня' }).innerText()).split('\n').filter(l => /30 дней/.test(l))[0]);
await p.screenshot({ path: 'energy-day.png' });

// 4. связки на «Я»
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
const card = await p.locator('.card', { hasText: 'ЭНЕРГИЯ' }).innerText();
console.log('5) карточка связок:');
card.split('\n').forEach(l => l.trim() && console.log('   ', l));
await p.screenshot({ path: 'energy-me.png' });

// 5. строка в трекере
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
const row = await p.locator('.tr tbody tr', { hasText: 'Энергия' }).innerText();
console.log('6) строка трекера:', row.replace(/\s+/g, ' '));
console.log('   за год — среднее, а не сумма:', !/\b[3-9]\d{2,}\b/.test(row.split(' ').pop() || ''));
await p.screenshot({ path: 'energy-tracker.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
