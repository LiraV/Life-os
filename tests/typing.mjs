// Клавиатура не должна закрываться сама. Перерисовка собирает экран заново, и
// поле ввода вместе с фокусом исчезает — на телефоне это выглядит как
// «клавиатура захлопнулась посреди слова». Так было в инбоксе: отправка в
// облако начинается через несколько секунд после любой правки и сбивала набор.
//
// Чинится переносом набора, а не откладыванием перерисовки: экран, который
// отстаёт от данных, хуже — на этом однажды сломался чат.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(800);

const focused = () => p.evaluate(() => {
  const el = document.activeElement;
  return { тег: el?.tagName || 'нет', поле: el?.dataset?.field || '', значение: el?.value ?? '' };
});

// ── набираем в инбоксе, а в это время приложение обновляет состояние ──
await p.evaluate(() => { location.hash = '#/inbox'; }); await p.waitForTimeout(500);
await p.locator('input[data-field="quick"]').click();
await p.type('input[data-field="quick"]', 'мысль на середине');
let f = await focused();
ok('поле в фокусе, пока пишем', f.поле === 'quick' && /мысль/.test(f.значение), JSON.stringify(f));

// Что-то поменялось в стороне — ровно то, что делает синхронизация.
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.user.xp += 1; });
});
await p.waitForTimeout(400);
f = await focused();
ok('после чужой перерисовки фокус остался', f.поле === 'quick', JSON.stringify(f));
ok('и набранное не пропало', f.значение === 'мысль на середине', f.значение);

// Дописываем — текст должен продолжиться, а не начаться заново.
await p.type('input[data-field="quick"]', ' и ещё');
f = await focused();
ok('можно дописывать дальше', f.значение === 'мысль на середине и ещё', f.значение);

// ── экран всё это время показывает настоящие данные ─────────────
// Раньше перерисовка откладывалась до конца набора, и экран отставал от
// данных. Это сломало чат: отправленное сообщение ложилось в данные и не
// появлялось на экране. Теперь рисуем сразу, а набранное переносим.
const xp = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).user.xp);
const shown = await p.locator('#statusbar').innerText();
ok('экран показывает состояние, не дожидаясь конца набора', shown.includes(String(xp)), `${shown} · в данных ${xp}`);

// Граница правила: переносится только то поле, в котором пишут прямо сейчас.
// Поле, оставленное без фокуса, перерисовка очищает — и так и задумано:
// вернуть текст в поле, которое экран сам обнулил после добавления записи,
// значило бы показать человеку мысль, уже лежащую в списке.
await p.locator('.title').first().click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.user.xp += 1; });
});
await p.waitForTimeout(400);
ok('поле без фокуса перерисовка очищает',
  await p.inputValue('input[data-field="quick"]') === '',
  await p.inputValue('input[data-field="quick"]'));

// ── Enter по-прежнему добавляет и очищает поле ──────────────────
await p.locator('input[data-field="quick"]').click();
await p.type('input[data-field="quick"]', 'вторая мысль');
await p.press('input[data-field="quick"]', 'Enter'); await p.waitForTimeout(600);
const s = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
ok('запись добавилась', s.inbox.some(x => x.text === 'вторая мысль'), s.inbox.map(x => x.text).join(', '));
f = await focused();
ok('поле очистилось и осталось в фокусе', f.поле === 'quick' && f.значение === '', JSON.stringify(f));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ клавиатура не захлопывается сама');
process.exit(bad ? 1 : 0);
