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

// 1. профильные черты появились сами
let s = await st();
console.log('1) черты из профиля:', s.user.traits.join(', '));

// 2. ползунки профиля меняют черты
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
await p.getByText('Изменить').first().click(); await p.waitForTimeout(400);
await p.locator('input[name="activity"]').fill('85');
await p.locator('input[name="introversion"]').fill('80');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
s = await st();
console.log('2) после ползунков:', s.user.traits.join(', '), '(ожидаем sprinter и quiet)');

// 3. тест мотивации выдаёт черту с эффектом
await p.evaluate(() => { location.hash = '#/inside/tests'; }); await p.waitForTimeout(500);
await p.locator('.card', { hasText: 'Мотивация' }).getByText('начать').click(); await p.waitForTimeout(350);
for (let i = 0; i < 3; i++) { await p.locator('[data-act="answer"]').nth(2).click(); await p.waitForTimeout(250); }
console.log('3) результат теста:', (await p.locator('.card').first().innerText()).replace(/\n+/g, ' | '));
console.log('   что перестроится:', (await p.locator('.card').nth(1).innerText()).replace(/\n+/g, ' | '));
await p.getByText('Сохранить').click(); await p.waitForTimeout(600);
s = await st();
console.log('   черты:', s.user.traits.join(', '));

// 4. эффект «Соревновательницы»: проценты и «было/стало»
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(600);
let me = await p.locator('.scr').innerText();
console.log('4) на «Я» с racer:', me.split('\n').filter(l => /было|XP|Неделя/.test(l)).join(' | '));
console.log('   титул:', (await p.locator('.caps').first().innerText()));

// 5. переключаем на «Эстета» — интерфейс должен смениться
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.user.traits = x.user.traits.filter(t => t !== 'racer').concat('aesthete');
  x.energy = {}; const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
  for (let i = 0; i < 8; i++) x.energy[iso(i)] = 70 + (i % 3);   // на «раннюю пташку»
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
me = await p.locator('.scr').innerText();
console.log('5) с aesthete: проценты ушли:', !/\d+%/.test(me.split('ПОТРЕБНОСТИ')[1]?.slice(0, 200) || ''),
  '| точки есть:', /●|○/.test(me));
s = await st();
console.log('   заработанная черта пришла:', s.user.traits.includes('earlybird'), '|', s.user.traits.join(', '));

// 6. полка черт
await p.getByText('все ›').click(); await p.waitForTimeout(500);
const shelf = await p.locator('.card', { hasText: 'ЧЕРТЫ' }).innerText();
console.log('6) полка:', shelf.split('\n')[0], '| строк:', shelf.split('\n').length);
console.log('   пример закрытой:', shelf.split('\n').filter(l => /Копит|Доводит/.test(l))[0]);
await p.screenshot({ path: 'traits.png' });

// 7. «Хранительница смысла» показывает цепочку в квесте
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.user.traits = x.user.traits.filter(t => t !== 'aesthete').concat('keeper');
  const t = new Date().toISOString().slice(0,10);
  x.goals = [{ id: 'g1', title: 'Сдать главу 2', horizon: 'month', period: t.slice(0,7), steps: [], slots: [], parentId: '' }];
  x.quests = { [t]: [{ id: 'q1', title: 'Черновик', done: false, sphere: 'edu', goalId: 'g1', time: '20:30' }] };
  x.years = { [t.slice(0,4)]: { theme: 'Свой голос', quarters: {} } };
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
console.log('7) квест с keeper:', (await p.locator('.quest').innerText()).replace(/\n+/g, ' | '));

// 8. перегруз и отдых в совете
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  const t = new Date().toISOString().slice(0,10);
  x.user.activity = 20;
  x.quests[t] = Array.from({ length: 7 }, (_, i) => ({ id: 'q' + i, title: 'Дело ' + i, done: false, sphere: '' }));
  x.energy[t] = 20;
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
const ai = await p.locator('.ai').allInnerTexts();
console.log('8) советы:', ai.map(x => x.slice(0, 70)).join(' // '));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
