import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
// эмулируем iPhone: там и происходит зум при фокусе
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);

// 1. размер шрифта у полей — 16px, иначе iOS приближает
const onbFont = await p.locator('input[data-field="name"]').evaluate(e => getComputedStyle(e).fontSize);
console.log('1) поле имени в онбординге:', onbFont, onbFont === '16px' ? '✓ зума не будет' : '✗ БУДЕТ ЗУМ');
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
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(300);
await p.getByText('+ Цель месяца').click(); await p.waitForTimeout(350);
const sizes = await p.evaluate(() => {
  const out = {};
  document.querySelectorAll('.sheet input, .sheet textarea, .sheet select').forEach(e => {
    const t = e.type || e.tagName.toLowerCase();
    out[t] = getComputedStyle(e).fontSize;
  });
  return out;
});
console.log('   поля в шторке:', JSON.stringify(sizes));
console.log('   все ≥16px:', Object.values(sizes).every(v => parseFloat(v) >= 16));
const vp = await p.locator('meta[name=viewport]').getAttribute('content');
console.log('   viewport:', vp);
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(300);

// 2. намерения квартала — списком сразу. В месяце их нет намеренно:
// месяц про дела, а намерение — про то, как хочется прожить период.
console.log('2) в месяце намерений нет:', !/НАМЕРЕНИЯ/i.test(await p.locator('.scr').innerText()));
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(450);
// намерения квартала живут внутри блока года; первым идёт год, поэтому
// выбираем именно квартальную кнопку по её периоду
await p.locator('[data-act="intadd"][data-p*="Q"]').first().click();
await p.waitForTimeout(350);
await p.fill('textarea[name="text"]', 'Ходить в зал\n— Общаться с родными\n\n• Отдыхать\nЛожиться до 00:00');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
let st = await state();
const ym = Object.keys(st.intentions).find(k => /Q/.test(k));
console.log('   намерения квартала:', JSON.stringify(st.intentions[ym].map(i => i.text)));
console.log('   маркеры списка убраны:', st.intentions[ym].every(i => !/^[-–—•]/.test(i.text)));
console.log('   на экране:', (await p.locator('.scr').innerText()).match(/Намерения квартала[\s\S]{0,90}/i)?.[0]?.replace(/\n+/g, ' | ') || '—');

// 3. правка и удаление
await p.locator('.int-row', { hasText: 'Ходить в зал' }).locator('.grow').click(); await p.waitForTimeout(350);
await p.fill('input[name="text"]', 'Ходить в зал два раза в неделю');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(450);
st = await state();
console.log('3) после правки:', st.intentions[ym][0].text);
await p.locator('.int-row', { hasText: 'Отдыхать' }).locator('[data-act="intdel"]').click(); await p.waitForTimeout(450);
st = await state();
console.log('   после удаления осталось:', st.intentions[ym].length, JSON.stringify(st.intentions[ym].map(i => i.text)));

// 4. намерения года — отдельный список
await p.waitForTimeout(200);
await p.locator('.card', { hasText: 'НАМЕРЕНИЯ ГОДА' }).getByText('+ добавить').click(); await p.waitForTimeout(350);
await p.fill('textarea[name="text"]', 'Больше путешествовать');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
const q3 = p.locator('.card.mute', { hasText: 'НАМЕРЕНИЯ КВАРТАЛА' }).first();
await p.locator('.card', { hasText: 'июл–авг–сен' }).locator('[data-act="intadd"]').click(); await p.waitForTimeout(350);
await p.fill('textarea[name="text"]', 'Закрыть диплом спокойно');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('4) периоды с намерениями:', JSON.stringify(Object.fromEntries(Object.entries(st.intentions).map(([k, v]) => [k, v.length]))));
await p.screenshot({ path: 'intentions.png', fullPage: false });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
