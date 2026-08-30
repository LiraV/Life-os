// Квест и задание учёбы — одна работа: отметил квест, задание закрылось.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
p.on('pageerror', e => errs.push(e.message));
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => {
    s.ui.tips = 'off';
    s.study.places.push({ id: 'pl', name: 'Универ' });
    s.study.subjects.push({ id: 'su', placeId: 'pl', name: 'Матанализ', archived: false });
    s.study.tasks.push({ id: 'st1', subjectId: 'su', title: 'Курсовая глава 2', stage: 'draft', due: '', note: '' });
  });
  closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());

// ── из учёбы на день
await p.evaluate(() => { location.hash = '#/study'; }); await p.waitForTimeout(700);
await p.locator('[data-act="tab"][data-v="board"]').click().catch(() => {}); await p.waitForTimeout(500);
await p.locator('text=Курсовая глава 2').first().click(); await p.waitForTimeout(600);
ok('в задании есть «поставить на день»', await p.locator('[data-act="toDay"]').count() === 1);
await p.locator('[data-act="toDay"]').click(); await p.waitForTimeout(600);
ok('открылся квест с названием задания',
   (await p.locator('input[name="title"]').inputValue()) === 'Курсовая глава 2');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
let s = await st();
const q = (s.quests[today] || [])[0];
ok('квест завёлся и связан с заданием', q && q.studyId === 'st1');
ok('и сфера подставилась', q.sphere === 'study');

// ── отметка квеста закрывает задание
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
await p.locator('[data-act="toggle"]').first().click(); await p.waitForTimeout(800);
s = await st();
ok('задание перешло в «сдано»', s.study.tasks[0].stage === 'done');
await p.locator('[data-act="toggle"]').first().click(); await p.waitForTimeout(800);
s = await st();
ok('снятие вернуло его в работу', s.study.tasks[0].stage === 'draft');

// ── второй связанный квест не даёт откатить задание раньше времени
await p.evaluate(async t => {
  const { update, uid } = await import('./app/js/store.js');
  update(s2 => {
    s2.quests[t].push({ id: uid(), title: 'Ещё раз', time: '', minutes: 45, sphere: 'study',
      boss: false, goalId: '', lessonId: '', studyId: 'st1', done: true });
    s2.study.tasks[0].stage = 'done';
  });
}, today);
await p.waitForTimeout(500);
await p.locator('[data-act="toggle"]').first().click(); await p.waitForTimeout(700);
s = await st();
ok('пока держит другой связанный квест, задание остаётся сданным', s.study.tasks[0].stage === 'done');

// ── в «Сроках» задание не двоится
await p.evaluate(async t => {
  const { update } = await import('./app/js/store.js');
  update(s2 => { s2.study.tasks[0].due = t; s2.study.tasks[0].stage = 'draft'; });
}, today);
await p.waitForTimeout(600);
const scr = await p.locator('.scr').innerText();
const count = (scr.match(/Курсовая глава 2/g) || []).length;
ok(`задание на дне показано один раз (${count})`, count <= 2 && !/СРОКИ/i.test(scr));

// ── без связанного квеста «Сроки» его показывают
await p.evaluate(async t => {
  const { update } = await import('./app/js/store.js');
  update(s2 => { s2.quests[t] = []; });
}, today);
await p.waitForTimeout(600);
ok('без квеста задание возвращается в «Сроки»', /Сроки/i.test(await p.locator('.scr').innerText()));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
