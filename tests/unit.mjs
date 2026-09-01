// Конкретный урок с полки можно поставить в день — не курс целиком.
// Отметил квест — урок закрылся на полке; снял — открылся обратно, но только
// если его не держит другой квест.
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
const units = async () => (await st()).lessons[0].items[0].lessons;

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.lessons = [
    { id: 'c1', name: 'Итальянский', kind: 'course', log: {}, items: [
      { id: 'm1', title: 'Модуль 1', lessons: [
        { id: 'u1', title: 'Прошедшее время', done: false },
        { id: 'u2', title: 'Артикли', done: false },
        { id: 'u3', title: 'Числа', done: true },
      ] },
    ] },
    { id: 'pr1', name: 'Йога', kind: 'practice', log: {}, items: [] },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.hash = '#/edu';
  location.reload();
});
await p.waitForTimeout(900);

// Курс на полке свёрнут — раскрываем, чтобы добраться до уроков.
await p.locator('[data-act="toggle"][data-id="c1"]').click(); await p.waitForTimeout(500);

// ── кнопка «в день» есть у незакрытого урока и нет у закрытого ──
const rows = p.locator('.mod-body .chk-row');
ok('уроки видны', await rows.count() === 3, String(await rows.count()));
ok('у незакрытого урока есть «в день»', await rows.nth(0).locator('[data-act="subday"]').count() === 1);
ok('у закрытого — нет: его уже незачем ставить', await rows.nth(2).locator('[data-act="subday"]').count() === 0);

// ── ставим урок в день ──────────────────────────────────────────
await rows.nth(0).locator('[data-act="subday"]').click(); await p.waitForTimeout(600);
const sheet = await p.locator('.sheet').innerText();
ok('шторка квеста открылась как новая', /Новый квест/i.test(sheet), sheet.split('\n')[0]);
ok('название подставлено курсом и уроком',
  (await p.inputValue('.sheet input[name="title"]')) === 'Итальянский · Прошедшее время',
  await p.inputValue('.sheet input[name="title"]'));
ok('связка выбрана именно на уроке', (await p.inputValue('.sheet select[name="shelf"]')) === 'c1|u1',
  await p.inputValue('.sheet select[name="shelf"]'));
const opts = await p.locator('.sheet select[name="shelf"] option').allTextContents();
ok('в списке есть и весь курс, и уроки', opts.some(x => /весь курс/.test(x)) && opts.some(x => /Артикли/.test(x)), opts.join(' | '));
ok('пройденный урок в список не идёт', !opts.some(x => /Числа/.test(x)), opts.join(' | '));
ok('практика в списке одной строкой', opts.filter(x => /Йога/.test(x)).length === 1, opts.filter(x => /Йога/.test(x)).join(' | '));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);

let s = await st();
const q = (s.quests[today] || [])[0];
ok('квест лёг на сегодня', !!q, JSON.stringify(Object.keys(s.quests)));
ok('и помнит и курс, и урок', q?.lessonId === 'c1' && q?.unitId === 'u1', JSON.stringify({ l: q?.lessonId, u: q?.unitId }));
ok('сфера проставилась сама', q?.sphere === 'edu', q?.sphere);
ok('урок на полке пока не тронут', (await units())[0].done === false);

// ── отмечаем квест — урок закрывается ───────────────────────────
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
ok('в дне видно курс и урок', /Итальянский · Прошедшее время/.test(await p.locator('#scr').innerText()));
await p.locator('.quest [data-act="toggle"]').first().click(); await p.waitForTimeout(700);
ok('урок закрылся на полке', (await units())[0].done === true);
ok('и занятие засчиталось в журнал курса', (await st()).lessons[0].log[today] === 1);

// ── снимаем отметку — урок открывается обратно ──────────────────
await p.locator('.quest [data-act="toggle"]').first().click(); await p.waitForTimeout(700);
ok('урок открылся обратно', (await units())[0].done === false);
ok('и занятие ушло из журнала', (await st()).lessons[0].log[today] === undefined);

// ── один урок в двух квестах: снятие одной отметки не отменяет чужую
await p.evaluate(t => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  const first = s2.quests[t][0];
  s2.quests[t].push({ ...first, id: 'q2', title: 'Ещё раз', done: false });
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
  location.reload();
}, today);
await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('.quest [data-act="toggle"]').nth(0).click(); await p.waitForTimeout(600);
await p.locator('.quest [data-act="toggle"]').nth(1).click(); await p.waitForTimeout(600);
ok('оба квеста закрыты и урок закрыт', (await units())[0].done === true);
await p.locator('.quest [data-act="toggle"]').nth(0).click(); await p.waitForTimeout(600);
ok('снятие одной отметки не открывает урок — его держит второй квест', (await units())[0].done === true);
await p.locator('.quest [data-act="toggle"]').nth(1).click(); await p.waitForTimeout(600);
ok('а когда снят и второй — урок открылся', (await units())[0].done === false);

// ── курс целиком по-прежнему работает ───────────────────────────
await p.evaluate(t => {
  const s2 = JSON.parse(localStorage.getItem('lifeos.state'));
  s2.quests[t] = [{ id: 'q9', title: 'Занятие', minutes: 45, sphere: 'edu', lessonId: 'c1', unitId: '', done: false }];
  localStorage.setItem('lifeos.state', JSON.stringify(s2));
  location.reload();
}, today);
await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('.quest [data-act="toggle"]').first().click(); await p.waitForTimeout(700);
s = await st();
ok('курс целиком засчитывает занятие', s.lessons[0].log[today] === 1);
ok('и ни один урок при этом не закрывается', (await units()).filter(x => x.done).length === 1, JSON.stringify((await units()).map(x => x.done)));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ урок с полки живёт в дне');
process.exit(bad ? 1 : 0);
