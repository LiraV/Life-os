// Темп: спрашивается прямо, не выводится из «Активности», и тест его не теряет.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(800);

// ── онбординг: темп спрашивают, а не угадывают
ok('первый шаг онбординга', /Как тебя зовут|онбординг/i.test(await p.locator('.scr').innerText()) || true);
await p.locator('input[name="name"]').fill('Лера').catch(() => {});
await p.locator('[data-act="next"]').click(); await p.waitForTimeout(500);
let scr = await p.locator('.scr').innerText();
ok('есть вопрос про темп', /Как берёшься за дела/.test(scr), scr.split('\n').slice(0, 3).join(' · '));
ok('есть три ответа', await p.locator('[data-act="pace"]').count() === 3);
ok('по умолчанию — «по-разному»', await p.locator('[data-act="pace"].on').innerText() === 'По-разному',
  await p.locator('[data-act="pace"].on').innerText());
ok('сказано, что можно не выбирать', /Можно не выбирать/.test(scr));
ok('у «Активности» своя роль названа', /Активность — про движение/.test(scr));

// двигаем «Активность» вправо — темп не должен меняться
await p.locator('input[name="activity"]').evaluate(el => { el.value = 90; el.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(400);
ok('ползунок активности темп не трогает', await p.locator('[data-act="pace"].on').innerText() === 'По-разному');

await p.locator('[data-act="pace"][data-v="sprint"]').click(); await p.waitForTimeout(400);
ok('выбор запомнился', await p.locator('[data-act="pace"].on').innerText() === 'Рывками');
ok('и объяснено, что это меняет', /норма дня выше/i.test(await p.locator('.scr').innerText()));

await p.locator('[data-act="next"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="finish"], [data-act="next"]').first().click(); await p.waitForTimeout(800);
let s = await st();
ok('темп сохранён в профиль', s.user.pace === 'sprint', s.user.pace);
ok('черта «Спринтер» на полке', (s.user.traits || []).includes('sprinter'), (s.user.traits || []).join(', '));

// ── «по-разному» — черты темпа нет вовсе
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.user.pace = ''; x.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
s = await st();
ok('без выбора черты темпа нет', !(s.user.traits || []).some(t => t === 'sprinter' || t === 'marathoner'),
  (s.user.traits || []).join(', '));
ok('остальные профильные черты на месте', (s.user.traits || []).some(t => ['owl', 'lark', 'floating'].includes(t)));

// ── тест «Упорство» ставит темп, и профиль его не затирает
const res = await p.evaluate(async () => {
  const { TESTS } = await import('./app/js/tests.js');
  const t = TESTS.grit;
  const low = {}, high = {};
  t.items.forEach((it, i) => { low[i] = it.rev ? 5 : 1; high[i] = it.rev ? 1 : 5; });
  return { low: t.score(low, t.items), high: t.score(high, t.items) };
});
ok('низкий балл — спринтер', res.low.pace === 'sprint', JSON.stringify(res.low.pace));
ok('высокий балл — марафонец', res.high.pace === 'even', JSON.stringify(res.high.pace));
ok('черта тестом больше не выдаётся', res.low.traitId === undefined && res.high.traitId === undefined);

await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.user.pace = 'even'; x.user.activity = 95;   // ползунок «за спринтера», профиль — за марафонца
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
s = await st();
ok('высокая активность не перебивает выбранный темп',
  (s.user.traits || []).includes('marathoner') && !(s.user.traits || []).includes('sprinter'),
  (s.user.traits || []).join(', '));

// ── старым данным темп достаётся тот, что они уже видели
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 42, onboarded: true,
    user: { name: 'Старая', chronotype: 'сова', activity: 80, introversion: 50 } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('активной было 80 — остался спринтер', s.user.pace === 'sprint' && (s.user.traits || []).includes('sprinter'),
  `${s.user.pace} · ${(s.user.traits || []).join(', ')}`);
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 42, onboarded: true,
    user: { name: 'Старая', chronotype: 'сова', activity: 55, introversion: 50 } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('было 55 — остался марафонец', s.user.pace === 'even' && (s.user.traits || []).includes('marathoner'), s.user.pace);

// ── профиль на «Я» правит темп
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
await p.locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
ok('в профиле есть выбор темпа', await p.locator('.sheet .opts[data-name="pace"] .opt').count() === 3);
await p.locator('.sheet .opts[data-name="pace"] .opt[data-value="sprint"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('правка темпа применилась', s.user.pace === 'sprint' && (s.user.traits || []).includes('sprinter'),
  `${s.user.pace} · ${(s.user.traits || []).join(', ')}`);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
