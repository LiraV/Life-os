// Забота и «День»: дело, которому пора, видно в сроках; квест можно привязать
// к делу; и дело можно отправить в день одной кнопкой.
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

// ── 1. просроченное дело видно в «Дне» ──────────────────────────
await day();
let t = await scr();
ok('дело, которому пора, попало в сроки', /Стрижка/.test(t), (t.match(/СРОКИ[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' · '));
ok('и помечено как забота', /забота/i.test(t));
ok('то, что не скоро, в день не лезет', !/Диспансеризация/.test(t));
ok('делу без ритма срок не выдумали', !/Когда-нибудь/.test(t));

// ── 2. отметка прямо из дня, и её можно снять ───────────────────
await p.locator('.quest', { hasText: 'Стрижка' }).locator('.check').click(); await p.waitForTimeout(600);
let s = await st();
ok('отметилось сегодняшним днём', s.care.items[0].log.includes(today), JSON.stringify(s.care.items[0].log));
ok('и «последний раз» стал сегодня', s.care.items[0].last === today, s.care.items[0].last);
ok('отмеченное не исчезло с глаз', /Стрижка/.test(await scr()));

await p.locator('.quest', { hasText: 'Стрижка' }).locator('.check').click(); await p.waitForTimeout(600);
s = await st();
ok('снятая отметка убрала именно этот день', !s.care.items[0].log.includes(today), JSON.stringify(s.care.items[0].log));
ok('а прошлая запись осталась', s.care.items[0].log.includes(long), JSON.stringify(s.care.items[0].log));
ok('и «последний раз» вернулся к прошлой', s.care.items[0].last === long, s.care.items[0].last);

// ── 3. дело уходит в день квестом ───────────────────────────────
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

// ── 4. в сроках дубля нет: дело уже стоит квестом ───────────────
await day();
t = await scr();
// Ищем строку сроков по её кнопке, а не по тексту: то же слово есть и у квеста.
ok('в сроках дела больше нет — оно стоит квестом',
  await p.locator('[data-act="dueopen"][data-id="c1"]').count() === 0,
  String(await p.locator('[data-act="dueopen"][data-id="c1"]').count()));

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
