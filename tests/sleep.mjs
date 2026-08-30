// Сон: отметка за ночь, среднее, связка с энергией, «Тело» и трекер.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const card = () => p.locator('.card', { hasText: 'Сегодня ночью' }).innerText();

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.user.sleep = 8;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. до отметки
let t = await card();
ok('карточка сна на «Дне»', /Сегодня ночью/.test(t));
ok('видно, что пока не отмечено', /не отмечено/.test(t), (t.match(/.{0,20}не отмечено/) || [''])[0]);
ok('сказано, к какому дню относится ночь', /в которое ты проснулась/.test(t));
ok('в состоянии сна нет', Object.keys((await st()).sleep).length === 0);

// ── 2. отметка ползунком, без отпускания
const slider = p.locator('input[type=range][data-act-input="sleepLive"]');
await slider.evaluate(el => { el.value = 6.5; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(400);
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
ok('записалось в момент движения', (await st()).sleep[today] === 6.5, JSON.stringify((await st()).sleep));
ok('экран не перерисовался, ползунок жив', await slider.count() === 1);
ok('подпись обновилась без перерисовки', /6,5 ч · меньше нормы/.test(await p.locator('#s_out').innerText()),
  await p.locator('#s_out').innerText());

await slider.evaluate(el => el.dispatchEvent(new Event('change', { bubbles: true })));
await p.waitForTimeout(600);
ok('после отпускания подсказка ушла', !/не отмечено/.test(await card()));

// ── 3. полчаса остаются половиной, лишнее округляется
await slider.evaluate(el => { el.value = 7.25; el.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(500);
ok('шаг — полчаса', (await st()).sleep[today] === 7.5, String((await st()).sleep[today]));

// ── 4. оценка без упрёка
for (const [v, want] of [[8, 'по норме'], [7, 'меньше нормы'], [5, 'сильно меньше нормы'], [10, 'больше нормы'], [0, 'совсем без сна']]) {
  await slider.evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await p.waitForTimeout(220);
  const out = await p.locator('#s_out').innerText();
  ok(`${v} ч подписано «${want}»`, out.includes(want), out);
}
ok('нигде нет упрёка', !/плохо|мало спишь|надо|должн/i.test(await card()));

// ── 5. вчерашняя ночь отмечается отдельно
await p.locator('[data-act="prev"]').click(); await p.waitForTimeout(500);
ok('на вчера подпись другая', /В эту ночь/.test(await p.locator('.card', { hasText: 'В эту ночь' }).innerText()));
await p.locator('input[type=range][data-act-input="sleepLive"]')
  .evaluate(el => { el.value = 9; el.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(600);
let sl = (await st()).sleep;
ok('две ночи живут отдельно', Object.keys(sl).length === 2, JSON.stringify(sl));
ok('сегодняшняя не затёрлась', sl[today] === 0, String(sl[today]));

ok('ноль — законная отметка, а не «не отмечено»', await p.evaluate(async () => {
  const { S } = await import('./app/js/store.js');
  const t = new Date().toISOString().slice(0, 10);
  return t in S.sleep;
}));

// ── 6. среднее и полоска
await p.evaluate(() => { location.hash = '#/day'; });
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.sleep = {};
  for (let i = 0; i < 10; i++) s.sleep[iso(i)] = i % 2 ? 7 : 9;   // среднее 8
  s.ui.date = iso(0);
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
t = await card();
ok('среднее посчитано', /в среднем 8 ч за 10 ночей/.test(t), (t.match(/в среднем.{0,20}/) || [''])[0]);
ok('полоска за 30 ночей есть', await p.locator('.card', { hasText: 'Сегодня ночью' }).locator('.spark i').count() === 30,
  String(await p.locator('.card', { hasText: 'Сегодня ночью' }).locator('.spark i').count()));
const empty = await p.locator('.card', { hasText: 'Сегодня ночью' }).locator('.spark i.none').count();
ok('неотмеченные ночи остались пустыми', empty === 20, String(empty));

// ── 7. связка с энергией
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.sleep = {}; s.energy = {};
  for (let i = 0; i < 12; i++) {
    const long = i % 2 === 0;
    s.sleep[iso(i)] = long ? 9 : 6;
    s.energy[iso(i)] = { 2: long ? 80 : 50 };
  }
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(800);
const me = await p.locator('.card', { hasText: /энергия/i }).first().innerText();
ok('связка сна и энергии показана', /В зависимости от сна/.test(me), me.replace(/\n/g, ' · ').slice(0, 160));
ok('разница названа', /бодрее на 30/.test(me), (me.match(/бодрее.{0,12}/) || [''])[0]);

// на двух ночах связь не выдумывается
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.sleep = {}; s.energy = {};
  for (let i = 0; i < 6; i++) { s.sleep[iso(i)] = i < 2 ? 6 : 9; s.energy[iso(i)] = { 2: i < 2 ? 40 : 80 }; }
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(800);
ok('на двух коротких ночах связь не показывается',
  !/В зависимости от сна/.test(await p.locator('.card', { hasText: /энергия/i }).first().innerText()));

// ── 8. «Тело» и трекер
await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(800);
const hl = await p.locator('.card', { hasText: /норма \d+ ч/ }).innerText();
ok('в «Теле» показано среднее из отметок', /в среднем за 30 ночей/.test(hl) && /Отмечено \d+ из 30/.test(hl), hl.replace(/\n/g, ' · '));
await p.locator('[data-act="measure"]').click(); await p.waitForTimeout(450);
ok('в замерах поля сна больше нет', await p.locator('.sheet input[name="sleep"]').count() === 0);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(800);
const row = (await p.locator('.tr tbody tr').filter({ hasText: 'Сон' }).first().innerText()).replace(/\s+/g, ' ');
ok('в трекере есть строка сна', /сон/i.test(row), row);
ok('за год у сна среднее, а не сумма', !/\b\d{3,}\b/.test(row), row);

// ── 9. старые данные без поля сна
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.v = 41; delete s.sleep;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
ok('без поля сна приложение живо', await p.locator('.scr').count() === 1);
ok('и сон стал пустым, а не нулевым', JSON.stringify((await st()).sleep) === '{}', JSON.stringify((await st()).sleep));

await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
await p.screenshot({ path: 'sleep.png' });
console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
