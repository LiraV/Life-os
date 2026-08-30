// Единственная функция, которая переписывает данные человека, — migrate.
// Здесь она проверяется двумя свойствами, не зависящими от её внутренностей:
// повторный прогон ничего не меняет, и на разном мусоре она не падает и не
// теряет заведённое. Плюс сверка с эталоном: см. golden.mjs.
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

const res = await p.evaluate(async () => {
  const { migrate } = await import('/app/js/store.js');
  // Случайные id мешают сравнивать: заменяем их по порядку появления.
  const norm = o => {
    const seen = new Map();
    return JSON.stringify(o, (k, v) => {
      if (typeof v === 'string' && /^[a-z0-9]{8}[a-z0-9]{4}$/.test(v)) {
        if (!seen.has(v)) seen.set(v, 'id' + seen.size);
        return seen.get(v);
      }
      if (k === 'updatedAt' && typeof v === 'string') return 'когда-то';
      return v;
    });
  };
  const cases = {
    'пустой объект': {},
    'без версии': { onboarded: true, user: { name: 'Лера' } },
    'версия из будущего': { v: 999, onboarded: true },
    'ветки не тех типов': { goals: 'строка', habits: 42, user: null, spheres: [], budget: 0, ui: 'нет' },
    'записи без обязательных полей': {
      goals: [{ title: 'Без id' }, null, 'мусор'],
      habits: [{ name: 'Вода' }, {}],
      library: { books: [{ title: 'Книга' }] },
      free: { orders: [{ title: 'Заказ', price: '1500,7', fee: 900 }] },
      health: { measures: [{ date: '2026-01-01', extra: { a: 'x', b: '5' } }], metrics: [{ name: '' }, { name: 'Шея' }] },
    },
    'богатое состояние': {
      v: 40, onboarded: true,
      user: { name: 'Лера', sex: 'f', height: 170, wrist: 15 },
      goals: [{ id: 'g1', title: 'Цель', horizon: 'month', period: '2026-08', target: 5, current: 2 }],
      budget: { start: 1000, ops: [{ id: 'o1', kind: 'income', sum: 500, date: '2026-08-01' }], cats: { income: [], expense: [] } },
      blog: { posts: [{ id: 'p1', title: 'Пост', stage: 'out', day: '2026-08-01' }] },
    },
  };
  const out = { pass: [], fail: [] };
  for (const [name, input] of Object.entries(cases)) {
    let once, twice;
    try { once = migrate(JSON.parse(JSON.stringify(input))); }
    catch (e) { out.fail.push(`${name}: migrate упал — ${e.message}`); continue; }
    try { twice = migrate(JSON.parse(JSON.stringify(once))); }
    catch (e) { out.fail.push(`${name}: повторный migrate упал — ${e.message}`); continue; }
    if (norm(once) !== norm(twice)) out.fail.push(`${name}: повторный прогон изменил данные`);
    else out.pass.push(name);
  }
  // Заведённое не теряется: цель, операция и пост доживают до конца.
  const rich = migrate(JSON.parse(JSON.stringify(cases['богатое состояние'])));
  if (rich.goals.length !== 1) out.fail.push('цель потерялась');
  if (rich.budget.ops.length !== 1) out.fail.push('операция потерялась');
  if (rich.blog.posts.length !== 1) out.fail.push('пост потерялся');
  if (rich.user.name !== 'Лера') out.fail.push('имя потерялось');
  if (rich.budget.start !== 1000) out.fail.push('стартовая сумма потерялась');
  return out;
});
for (const n of res.pass) ok(`«${n}»: повторный прогон ничего не меняет`, true);
for (const f of res.fail) ok(f, false);
await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ migrate устойчив и ничего не теряет');
process.exit(bad ? 1 : 0);
