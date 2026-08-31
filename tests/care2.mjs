// Забота и «День». Главное правило: забота НЕ приходит в день сама. Дело лежит
// в «Заботе», пока человек не поставит его на конкретный день — приложение
// показывает, что пора, но не занимает чужой день без спроса.
//
// Связь при этом работает в обе стороны: отметка квеста отмечает дело.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const scr = () => p.locator('#scr').innerText();
const day = async () => { await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(500); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
const long = await p.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); });

await p.evaluate(([t, l]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.care.items = [
    // Пора: отмечали полгода назад при ритме «раз в месяц».
    { id: 'c1', name: 'Стрижка', group: 'body', every: 1, anchor: 0, last: l, log: [l], cost: 0, note: '', link: '' },
    // Ещё не скоро: отмечали сегодня при ритме «раз в год».
    { id: 'c2', name: 'Диспансеризация', group: 'health', every: 12, anchor: 0, last: t, log: [t], cost: 0, note: '', link: '' },
    // Без ритма и без отметок — срока у него нет, выдумывать нельзя.
    { id: 'c3', name: 'Когда-нибудь', group: 'body', every: 0, anchor: 0, last: '', log: [], cost: 0, note: '', link: '' },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
}, [today, long]);
await p.waitForTimeout(900);

// ── 1. забота не лезет в день сама ──────────────────────────────
await day();
let t = await scr();
ok('просроченного дела в дне нет — оно ждёт в «Заботе»', !/Стрижка/.test(t),
  (t.match(/СРОКИ[\s\S]{0,60}/) || ['блока сроков нет'])[0].replace(/\n/g, ' · '));
ok('и никакой заботы в дне вообще', !/забота/i.test(t));
let s = await st();

// ── 2. а в «Заботе» оно видно и отмечается ──────────────────────
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
ok('в «Заботе» дело на месте', /Стрижка/.test(await scr()));

// ── 3. дело уходит в день квестом — по кнопке, а не само ────────
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
await p.locator('.care-row', { hasText: 'Стрижка' }).locator('[data-act="toquest"]').click(); await p.waitForTimeout(600);
s = await st();
const q = (s.quests[today] || []).find(x => x.careId === 'c1');
ok('квест завёлся и привязан к делу', !!q && q.title === 'Стрижка', JSON.stringify(q?.title));
ok('но сделанным его никто не объявил', q?.done === false);
ok('и само дело пока не отмечено', !s.care.items[0].log.includes(today));

await p.locator('.care-row', { hasText: 'Стрижка' }).locator('[data-act="toquest"]').click(); await p.waitForTimeout(500);
s = await st();
ok('второй раз то же дело в тот же день не заводится',
  (s.quests[today] || []).filter(x => x.careId === 'c1').length === 1,
  String((s.quests[today] || []).filter(x => x.careId === 'c1').length));

// ── 4. в дне оно теперь есть — но потому, что его туда поставили ─
await day();
ok('поставленное дело видно в дне квестом', /Стрижка/.test(await scr()));
ok('и это квест, а не строка сроков',
  await p.locator('[data-act="dueopen"][data-id="c1"]').count() === 0);

// ── 5. отметка квеста отмечает дело ─────────────────────────────
await p.locator('.quest', { hasText: 'Стрижка' }).locator('.check').first().click(); await p.waitForTimeout(700);
s = await st();
ok('отметка квеста отметила дело', s.care.items[0].log.includes(today), JSON.stringify(s.care.items[0].log));
await p.locator('.quest', { hasText: 'Стрижка' }).locator('.check').first().click(); await p.waitForTimeout(700);
s = await st();
ok('снятие отметки убрало и отметку дела', !s.care.items[0].log.includes(today), JSON.stringify(s.care.items[0].log));

// ── поле связи есть в самой шторке квеста ───────────────────────
// Проверка сначала этого не делала — и пропустила забытый импорт, из-за
// которого шторка квеста падала целиком. Открыть её обязательно.
await day();
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(600);
ok('в шторке квеста есть выбор дела', await p.locator('.sheet select[name="careId"]').count() === 1);
const opts = await p.locator('.sheet select[name="careId"] option').allTextContents();
ok('и в нём перечислены дела', opts.some(x => /Стрижка/.test(x)), opts.join(', '));
await p.selectOption('.sheet select[name="careId"]', 'c2');
await p.fill('.sheet input[name="title"]', 'Сходить к врачу');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const linked = (s.quests[today] || []).find(x => x.title === 'Сходить к врачу');
ok('связь сохранилась', linked?.careId === 'c2', JSON.stringify(linked?.careId));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ забота и день связаны');
process.exit(bad ? 1 : 0);
