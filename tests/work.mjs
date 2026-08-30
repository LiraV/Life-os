// «Работа»: наём. Одно место — просто; два — везде по месту.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());

// ── пустая сфера просит завести место
await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(800);
ok('без места работы сфера просит его завести', /Мест работы пока нет/.test(await p.locator('.scr').innerText()));

// ── первое место: её график
await p.locator('[data-act="jobadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="company"]', 'Магнит');
await p.fill('input[name="title"]', 'Специалист по рекламе');
await p.fill('input[name="from"]', '11:00');
await p.fill('input[name="to"]', '18:00');
await p.fill('input[name="salary"]', '30000');
await p.fill('input[name="officeNorm"]', '8');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const j1 = (await st()).work.jobs[0];
ok('место завелось со своим графиком', j1.company === 'Магнит' && j1.sched.start === '11:00' && j1.sched.lunch === 60);
const norms = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const j = m.jobsNow()[0];
  return { day: m.jobDayNorm(j), week: m.jobWeekNorm(j), all: m.weekNormAll() };
});
ok(`норма дня 6 ч, недели 30 (${norms.day} / ${norms.week})`, norms.day === 6 && norms.week === 30);

// ── с одним местом выбора места нет нигде
ok('с одним местом полоски выбора нет', await p.locator('[data-act="job"]').count() === 0);
await p.locator('[data-act="quick"][data-w="office"]').click(); await p.waitForTimeout(700);
const d1 = (await st()).work.days[today][j1.id];
ok('день отмечен под своим местом', d1 && d1.hours === 6 && d1.where === 'office');

// ── второе место со своим графиком
await p.locator('[data-act="tab"][data-v="road"]').click(); await p.waitForTimeout(600);
await p.locator('[data-act="jobadd"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="company"]', 'Вторая работа');
await p.fill('input[name="from"]', '19:00');
await p.fill('input[name="to"]', '22:00');
await p.fill('input[name="lunch"]', '0');
await p.fill('input[name="salary"]', '15000');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const jobs = (await st()).work.jobs;
ok('второе место завелось', jobs.length === 2);
const n2 = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { all: m.weekNormAll(), second: m.jobDayNorm(m.jobsNow()[1]) };
});
ok(`норма второго места 3 ч (${n2.second})`, n2.second === 3);
ok(`нормы недели сложились: 30 + 15 = 45 (${n2.all})`, n2.all === 45);

// ── теперь выбор места появился
await p.locator('[data-act="tab"][data-v="now"]').click(); await p.waitForTimeout(600);
ok('с двумя местами появился выбор места', await p.locator('[data-act="job"]').count() >= 3);
ok('карточка «сегодня» есть у каждого места',
   (await p.locator('[data-act="quick"]').count()) === 2 || (await p.locator('[data-act="mark"]').count()) >= 1);

// отмечаем второе место в тот же день
const j2 = jobs[1].id;
await p.locator(`[data-act="quick"][data-j="${j2}"][data-w="home"]`).click(); await p.waitForTimeout(700);
const both = (await st()).work.days[today];
ok('в одном дне две записи — по одной на место', Object.keys(both).length === 2);
const wk = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const d = await import('./app/js/dates.js');
  return { all: m.workWeek(d.todayISO()), days: m.workedDays(d.todayISO(), d.todayISO()) };
});
ok(`часы сложились: 6 + 3 = 9 (${wk.all.hours})`, wk.all.hours === 9);
ok('но день посчитан один, а не два', wk.days === 1);

// ── ставка не складывается, а считается по месту
const rates = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const d = await import('./app/js/dates.js');
  const ym = d.monthKey(d.todayISO());
  return { a: m.jobRate(m.jobsNow()[0], ym), b: m.jobRate(m.jobsNow()[1], ym), sum: m.salaryAll() };
});
ok(`ставка первого места 30000/6 = 5000 (${rates.a?.rate})`, rates.a.rate === 5000);
ok(`ставка второго 15000/3 = 5000 (${rates.b?.rate})`, rates.b.rate === 5000);
ok('оклады сложились — это складывать честно', rates.sum === 45000);
await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(700);
const year = await p.locator('.scr').innerText();
ok('на «Годе» карточка у каждого места', /Магнит/i.test(year) && /Вторая работа/i.test(year));
ok('и сумма окладов', year.replace(/\s/g, '').includes('45000'));

// ── отпуск считается по месту
await p.evaluate(async ([a]) => {
  const { update } = await import('./app/js/store.js');
  const { addDays, todayISO } = await import('./app/js/dates.js');
  update(s => { (s.work.days[addDays(todayISO(), -1)] ||= {})[a] = { type: 'vacation', hours: 0, where: 'office', note: '' }; });
}, [j1.id]);
await p.waitForTimeout(400);
const vac = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { a: m.jobVacation(m.jobsNow()[0]), b: m.jobVacation(m.jobsNow()[1]) };
});
ok('отпуск засчитан только своему месту', vac.a.used === 1 && vac.b.used === 0);

// ── задачи по месту
await p.locator('[data-act="tab"][data-v="board"]').click(); await p.waitForTimeout(600);
await p.locator('[data-act="job"][data-v="' + j1.id + '"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="cardadd"][data-col="ot-todo"]').first().click(); await p.waitForTimeout(600);
await p.fill('input[name="title"]', 'Пересобрать ставки');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
ok('задача привязалась к выбранному месту', (await st()).work.tasks[0].jobId === j1.id);
await p.locator('[data-act="job"][data-v="' + j2 + '"]').click(); await p.waitForTimeout(700);
ok('на доске второго места её нет', !/Пересобрать ставки/.test(await p.locator('.kb').innerText()));
await p.locator('[data-act="job"][data-v="all"]').click(); await p.waitForTimeout(700);
ok('во «всех местах» она видна', /Пересобрать ставки/.test(await p.locator('.kb').innerText()));

// ── путь: параллельные места стаж не удваивают
const total = await p.evaluate(async () => (await import('./app/js/selectors.js')).careerTotal());
ok(`два места разом дают один месяц стажа, а не два (${total})`, total === 1);

// ── удаление места уносит его отметки, но не задачи
await p.locator('[data-act="tab"][data-v="road"]').click(); await p.waitForTimeout(600);
await p.locator(`[data-act="job2"][data-id="${j2}"]`).first().click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const after = await st();
ok('место убралось', after.work.jobs.length === 1);
ok('его отметка дня ушла вместе с ним', !after.work.days[today][j2]);
ok('отметка первого места осталась', !!after.work.days[today][j1.id]);
ok('задачи остались', after.work.tasks.length === 1);
ok('выбор места снова исчез', (await p.locator('[data-act="job"]').count()) === 0);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
