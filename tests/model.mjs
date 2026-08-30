// Пригодность данных к базе: у каждой записи есть опознаваемый id, ссылки
// ведут в существующие записи, а ключи периодов везде одного вида.
// Проверяется на состоянии, которое приложение само себе завело, — и на
// богатом, собранном руками.
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
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);

const check = () => p.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('lifeos.state'));
  const pick = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), S);

  // Все списки записей: путь → сами записи. Ищем сами, а не по списку имён,
  // чтобы новая коллекция попадала под проверку без правки этого файла.
  const lists = [];
  const walk = (node, path, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 4) return;
    for (const [k, v] of Object.entries(node)) {
      const at2 = path ? `${path}.${k}` : k;
      if (Array.isArray(v)) {
        if (v.some(x => x && typeof x === 'object')) lists.push([at2, v]);
        v.forEach(x => walk(x, at2 + '[]', depth + 1));
      } else if (v && typeof v === 'object') walk(v, at2, depth + 1);
    }
  };
  walk(S, '');

  const out = { lists: lists.length, noId: [], dupIn: [], dupAcross: [], dangling: [], badPeriod: [], total: 0 };
  const seen = new Map();
  for (const [path, arr] of lists) {
    const ids = new Set();
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object') continue;
      out.total++;
      const rid = rec.id ?? rec.key;
      if (rid == null || rid === '') { out.noId.push(`${path}: запись без имени`); continue; }
      if (ids.has(rid)) out.dupIn.push(`${path}: имя ${rid} встречается дважды`);
      ids.add(rid);
      if (seen.has(rid) && seen.get(rid) !== path) out.dupAcross.push(`${rid}: и в ${seen.get(rid)}, и в ${path}`);
      seen.set(rid, path);
    }
  }

  // Карта ссылок: поле записи → где искать цель. Пустая строка значит «нет ссылки».
  // Часть коллекций — списки, часть — ящики по ключу (день, месяц). Для
  // проверки ссылок это одно и то же: перечень записей.
  const rowsOf = path => {
    const v = pick(path);
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v).flatMap(x => (Array.isArray(x) ? x : [x]));
    return [];
  };
  const has = (listPath, id) => rowsOf(listPath).some(x => x && x.id === id);
  const FK = [
    ['goals', 'parentId', 'goals'],
    ['work.tasks', 'jobId', 'work.jobs'],
    ['work.wins', 'jobId', 'work.jobs'],
    ['work.days', 'jobId', 'work.jobs'],
    ['study.subjects', 'placeId', 'study.places'],
    ['study.tasks', 'subjectId', 'study.subjects'],
    ['sport.workouts', 'templateId', 'sport.templates'],
    ['free.orders', 'serviceId', 'free.services'],
  ];
  for (const [listPath, field, target] of FK) {
    const rows = rowsOf(listPath);
    for (const rec of rows) {
      const v = rec && rec[field];
      if (v && !has(target, v)) out.dangling.push(`${listPath}.${field}=${v} → в ${target} такой записи нет`);
    }
  }
  // Пилюли тренировки — список ссылок.
  for (const w of S.sport?.workouts || []) {
    for (const t of w.tags || []) if (!has('sport.tags', t)) out.dangling.push(`тренировка ${w.id}: пилюля ${t} не существует`);
  }
  // Намерение цели живёт в ящике по периодам.
  for (const g of S.goals || []) {
    if (g.intentId && !Object.values(S.intentions || {}).some(l => (l || []).some(i => i.id === g.intentId))) {
      out.dangling.push(`цель ${g.id}: намерение ${g.intentId} не существует`);
    }
  }
  // Ключи периодов: «2026», «2026-08», «2026-Q3» — и ничего другого.
  const PERIOD = /^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/;
  for (const g of S.goals || []) if (g.period && !PERIOD.test(g.period)) out.badPeriod.push(`цель ${g.id}: период «${g.period}»`);
  for (const k of Object.keys(S.intentions || {})) if (!PERIOD.test(k)) out.badPeriod.push(`намерения: ключ «${k}»`);
  for (const k of Object.keys(S.budget?.plans || {})) if (!PERIOD.test(k)) out.badPeriod.push(`планы бюджета: ключ «${k}»`);
  // Ключи-даты в ящиках «по дню».
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  for (const box of ['quests', 'sleep', 'energy', 'food.days', 'health.days']) {
    for (const k of Object.keys(pick(box) || {})) if (!DAY.test(k)) out.badPeriod.push(`${box}: ключ «${k}» не дата`);
  }
  return out;
});

const fresh = await check();
ok(`свежее состояние: ${fresh.total} записей в ${fresh.lists} списках, у всех есть id`, fresh.noId.length === 0, fresh.noId.slice(0, 3).join(' | '));
ok('свежее состояние: id не повторяются внутри списка', fresh.dupIn.length === 0, fresh.dupIn.slice(0, 3).join(' | '));
ok('свежее состояние: id не повторяются между списками', fresh.dupAcross.length === 0, fresh.dupAcross.slice(0, 3).join(' | '));
ok('свежее состояние: ссылки ведут в существующие записи', fresh.dangling.length === 0, fresh.dangling.slice(0, 3).join(' | '));
ok('свежее состояние: ключи периодов и дат одного вида', fresh.badPeriod.length === 0, fresh.badPeriod.slice(0, 3).join(' | '));

// ── богатое состояние: те же мерки на настоящих данных ──────────
const seed = (extra = {}) => p.evaluate(x => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.sport.exercises = [{ id: 'ex1', name: 'Шпагат', unit: 'см', dir: 'down' }];
  s.sport.tags = [{ id: 'tg1', name: 'Растяжка' }];
  s.sport.workouts = [{ id: 'w1', date: '2026-08-01', done: true, tags: ['tg1'], sets: [] }];
  s.habits = [{ id: 'hb1', name: 'Вода', target: 1, unit: '', log: {} }];
  s.work.jobs = [{ id: 'j1', name: 'Место', start: '2026-01-01' }];
  s.work.tasks = [{ id: 'wt1', title: 'Задача', jobId: 'j1', column: 'now' }];
  s.study.places = [{ id: 'sp1', name: 'Курсы' }];
  s.study.subjects = [{ id: 'sb1', name: 'Предмет', placeId: 'sp1' }];
  s.study.tasks = [{ id: 'st1', title: 'Работа', subjectId: 'sb1' }];
  s.intentions = { 2026: [{ id: 'in1', text: 'Намерение' }] };
  s.goals = [{ id: 'g1', title: 'Сесть на шпагат', horizon: 'year', period: '2026', target: 0, current: 0,
    steps: [], slots: [], intentId: 'in1', src: { kind: 'exercise', ref: 'ex1', from: 20 } }];
  Object.assign(s, x);
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
}, extra);

await seed();
await p.waitForTimeout(800);
const rich = await check();
ok(`богатое состояние: ${rich.total} записей, у всех есть id`, rich.noId.length === 0, rich.noId.slice(0, 3).join(' | '));
ok('богатое состояние: ссылки ведут в существующие записи', rich.dangling.length === 0, rich.dangling.slice(0, 3).join(' | '));
ok('богатое состояние: id не повторяются между списками', rich.dupAcross.length === 0, rich.dupAcross.slice(0, 3).join(' | '));

// Самопроверка: сломанная ссылка должна быть найдена, иначе проверка ничего не стоит.
await seed({ work: { jobs: [], days: {}, tasks: [{ id: 'wt1', title: 'Задача', jobId: 'нет-такого', column: 'now' }], wins: [] } });
await p.waitForTimeout(800);
const broken = await check();
ok('проверка действительно ловит висячую ссылку', broken.dangling.length > 0, broken.dangling[0] || 'ничего не нашла');

// Удалённый источник не роняет цель и не подменяет число: он замирает на точке
// отсчёта. Имя источника при этом теряется — это осознанно, данные важнее.
await seed();
await p.waitForTimeout(800);
const before = await p.evaluate(async () => {
  const S = await import('/app/js/selectors.js');
  return S.autoCount(JSON.parse(localStorage.getItem('lifeos.state')).goals[0]);
});
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.sport.exercises = [];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForTimeout(800);
const after = await p.evaluate(async () => {
  const S = await import('/app/js/selectors.js');
  const g = JSON.parse(localStorage.getItem('lifeos.state')).goals[0];
  return { count: S.autoCount(g), label: S.autoLabel(g) };
});
ok('цель с удалённым источником не падает', typeof after.count === 'number', String(after.count));
ok('и не подменяет число: замирает на точке отсчёта', after.count === before, `было ${before}, стало ${after.count}`);
await p.evaluate(() => { location.hash = '#/plans/year'; });
await p.waitForTimeout(500);
ok('экран целей при этом открывается', !(await p.locator('#scr').innerText()).includes('Экран не открылся'));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ модель данных пригодна к переносу');
process.exit(bad ? 1 : 0);
