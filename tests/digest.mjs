// Летописец должен видеть всю жизнь, а не четверть. Раньше в выжимке были
// только день, цели и привычки — и он не мог ответить ни про работу, ни про
// деньги, ни про учёбу. Плюс род обращения: он меняется везде, а не местами.
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
const t0 = await p.evaluate(() => new Date().toISOString().slice(0, 10));
await p.evaluate(t => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.work.jobs = [{ id: 'j1', name: 'Студия', start: '2026-01-01', norm: 8, days: [1, 2, 3, 4, 5] }];
  s.work.days = { [t]: { j1: { type: 'work', hours: 6, where: 'office' } } };
  s.work.tasks = [{ id: 'w1', title: 'Макет', jobId: 'j1', column: 'l1', day: t }];
  s.study.subjects = [{ id: 'sb', name: 'Диплом' }];
  s.study.tasks = [{ id: 'st', subjectId: 'sb', title: 'Глава 3', stage: 'draft', due: t }];
  s.sport.workouts = [{ id: 'w', date: t, done: true, sets: [] }];
  s.food.days = { [t]: { water: 900, entries: [{ id: 'e', kcal: 500, prot: 30, fat: 10, carb: 40 }] } };
  s.budget.start = 40000;
  s.budget.ops = [{ id: 'o', kind: 'income', sum: 7458, date: t, catId: '' }];
  s.blog.posts = [{ id: 'p1', title: 'Пост', stage: 'out', day: t }];
  s.free.orders = [{ id: 'f1', title: 'Заказ', price: 5000, stage: 'paid', paidAt: t, fee: 0 }];
  s.biz.projects = [{ id: 'b1', name: 'Планер', stage: 'live', steps: [], metrics: [], marks: [] }];
  s.library.books = [{ id: 'k', title: 'Книга', status: 'reading' }];
  s.travel.visits = [{ id: 'v', country: 'Грузия', code: 'GE', year: Number(t.slice(0, 4)) }];
  s.inbox = [{ id: 'i', text: 'мысль', createdAt: t }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
}, t0);
await p.waitForTimeout(900);

const d = await p.evaluate(async () => (await import('/app/js/selectors.js')).chatDigest());
for (const [name, re] of [
  ['работу', /Работа: Студия/], ['учёбу', /Учёба: в работе 1/], ['спорт', /Спорт: 1 тренировка/],
  ['еду и воду', /Еда сегодня: 500 ккал[\s\S]*Вода 900/], ['деньги', /Деньги в [а-я]+: доход 7458/],
  ['блог', /Блог: 1 пост/], ['фриланс', /Фриланс: оплачено 1/], ['своё дело', /Моё дело: Планер — Запущено/],
  ['книги', /Книги: читает Книга/], ['страны', /Страны: за год 1/], ['инбокс', /В инбоксе 1/],
]) ok(`чат видит ${name}`, re.test(d), (d.match(re) || [''])[0].slice(0, 50));
ok('цикл в выжимку не попал', !/цикл|месячные/i.test(d));
ok('дневник в выжимку не попал', !/мысль/.test(d));

// ── род обращения меняется везде ────────────────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.user.sex = 'm'; s.ui.tips = 'on'; s.ui.tipsSeen = {};
  s.travel.visits = [{ id: 'v', country: 'Грузия', code: 'GE', year: 2026 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForTimeout(900);
const male = await p.evaluate(async () => (await import('/app/js/selectors.js')).chatDigest());
ok('чат знает про мужской род', /Пол: мужской/.test(male));

await p.evaluate(() => { location.hash = '#/trips/add'; }); await p.waitForTimeout(700);
await p.fill('input[data-field="q"]', 'Груз').catch(() => {});
await p.waitForTimeout(500);
let txt = await p.locator('#scr').innerText();
ok('в странах — «уже был», а не «была»', !/уже была/.test(txt), (txt.match(/уже был.{0,10}/) || ['не нашёл'])[0]);

await p.evaluate(() => { location.hash = '#/trips'; }); await p.waitForTimeout(700);
txt = await p.locator('#scr').innerText();
ok('в подсказке «Страны» тоже мужской род', !/где была/.test(txt), (txt.match(/где был.{0,12}/) || ['подсказки нет'])[0]);


// Анкета недели и тесты лежат списками — род там подставляется при показе.
const lists = await p.evaluate(async () => {
  const { REVIEW_Q } = await import('/app/js/review.js');
  const { TESTS } = await import('/app/js/tests.js');
  const { gt } = await import('/app/js/gender.js');
  return {
    review: REVIEW_Q.map(q => gt(q.q)).join(' \u00b7 '),
    grit: TESTS.grit.items.map(i => gt(i.t)).join(' \u00b7 '),
  };
});
ok('в анкете недели мужской род', !/Высыпалась|хотела|Понимала/.test(lists.review), lists.review.slice(0, 60));
ok('в тестах мужской род', !/усердна|что начала/.test(lists.grit), lists.grit.slice(0, 60));
ok('скобки разметки нигде не видны', !/[{}]/.test(lists.review + lists.grit));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ чат видит всё, род меняется везде');
process.exit(bad ? 1 : 0);
