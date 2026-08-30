// Слияние двух копий: телефон и ноутбук писали независимо. Проверяем не код, а
// обещание — ничего не теряется, удалённое не возвращается, вернувшееся не
// пропадает, а порядок сторон на результат не влияет.
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

const res = await p.evaluate(async () => {
  const { merge } = await import('/app/js/sync.js');
  const base = JSON.parse(localStorage.getItem('lifeos.state'));
  const T = (h, m2) => `2026-08-30T${String(h).padStart(2, '0')}:${String(m2).padStart(2, '0')}:00.000Z`;
  const copy = o => JSON.parse(JSON.stringify(o));

  // Общее прошлое: цель, привычка и отметка сна.
  base.goals = [{ id: 'g1', title: 'Цель', horizon: 'month', period: '2026-08', target: 5, current: 0,
    steps: [], slots: [], order: 0, createdAt: T(8, 0), updatedAt: T(8, 0) }];
  base.habits = [{ id: 'hb1', name: 'Вода', target: 1, log: { '2026-08-30': 1 }, order: 0, createdAt: T(8, 0), updatedAt: T(8, 0) }];
  base.sleep = { '2026-08-30': 7 };
  base.touched = { 'sleep.2026-08-30': T(8, 0), 'habits[hb1].log.2026-08-30': T(8, 0) };
  base.deleted = []; base.changedAt = T(8, 0); base.user.xp = 100;

  // Телефон: переименовал цель, отметил сон 8 часов, завёл заказ, набрал опыт.
  const phone = copy(base);
  phone.goals[0].title = 'Цель с телефона'; phone.goals[0].updatedAt = T(10, 0);
  phone.sleep['2026-08-30'] = 8; phone.touched['sleep.2026-08-30'] = T(10, 0);
  phone.free.orders = [{ id: 'o1', title: 'Заказ с телефона', price: 5000, cur: 'RUB', fee: 0, stage: 'talk',
    order: 0, createdAt: T(10, 0), updatedAt: T(10, 0) }];
  phone.user.xp = 130; phone.changedAt = T(10, 0);

  // Ноутбук: поднял цель по счётчику позже, стёр привычку, отметил воду.
  const laptop = copy(base);
  laptop.goals[0].current = 3; laptop.goals[0].updatedAt = T(11, 0);
  laptop.habits = []; laptop.deleted = [{ id: 'hb1', from: 'habits', at: T(11, 0) }];
  laptop.food.days = { '2026-08-30': { water: 1500, entries: [] } };
  laptop.touched['food.days.2026-08-30'] = T(11, 0);
  laptop.user.xp = 115; laptop.changedAt = T(11, 0);

  const m1 = merge(phone, laptop);
  const m2 = merge(laptop, phone);
  return {
    порядокНеВажен: JSON.stringify(m1) === JSON.stringify(m2),
    цель: m1.goals[0],
    заказНеПотерялся: m1.free.orders.length === 1 && m1.free.orders[0].title === 'Заказ с телефона',
    сон: m1.sleep['2026-08-30'],
    вода: m1.food.days['2026-08-30']?.water,
    привычкаУдалена: m1.habits.length === 0,
    опыт: m1.user.xp,
    следовУдаления: m1.deleted.length,
  };
});

ok('порядок сторон не меняет результат', res.порядокНеВажен);
ok('заказ с телефона не потерялся', res.заказНеПотерялся);
ok('отметка сна с телефона победила — её ставили позже', res.сон === 8, String(res.сон));
ok('вода с ноутбука доехала', res.вода === 1500, String(res.вода));
ok('привычка, удалённая на ноутбуке, не вернулась', res.привычкаУдалена);
ok('след от удаления сохранился', res.следовУдаления === 1, String(res.следовУдаления));
ok('опыт взят наибольший, а не «чей позже»', res.опыт === 130, String(res.опыт));
// Одну и ту же цель правили на обоих устройствах. Побеждает более поздняя
// правка — но целиком, всей записью. Значит, переименование с телефона здесь
// теряется, и это не недосмотр проверки, а цена правила «побеждает поздняя».
// Пишем это прямо, чтобы никто не принял зелёную галочку за «ничего не теряем».
ok('у цели победила более поздняя правка', res.цель.current === 3, String(res.цель.current));
ok('и переименование с телефона при этом потеряно — так работает правило',
  res.цель.title === 'Цель', res.цель.title);

// Вернувшаяся запись: удалили на одном, а на другом правили уже после удаления.
const back = await p.evaluate(async () => {
  const { merge } = await import('/app/js/sync.js');
  const base = JSON.parse(localStorage.getItem('lifeos.state'));
  const T = h => `2026-08-30T${String(h).padStart(2, '0')}:00:00.000Z`;
  const copy = o => JSON.parse(JSON.stringify(o));
  base.habits = [{ id: 'hb1', name: 'Вода', target: 1, log: {}, order: 0, createdAt: T(8), updatedAt: T(8) }];
  base.deleted = []; base.changedAt = T(8);
  const one = copy(base); one.habits = []; one.deleted = [{ id: 'hb1', from: 'habits', at: T(9) }]; one.changedAt = T(9);
  const two = copy(base); two.habits[0].name = 'Вода, снова'; two.habits[0].updatedAt = T(10); two.changedAt = T(10);
  const m = merge(one, two);
  return { осталась: m.habits.length === 1, имя: m.habits[0]?.name };
});
ok('правка позже удаления возвращает запись', back.осталась && back.имя === 'Вода, снова', JSON.stringify(back));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ две копии сходятся без потерь');
process.exit(bad ? 1 : 0);
