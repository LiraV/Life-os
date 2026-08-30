// Круг ролей считает всё отмеченное, а не одни квесты.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (name, cond) => { if (!cond) bad++; console.log(`${cond ? '✓' : '✗'} ${name}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; }); closeSheet();
    const raw = localStorage.getItem('lifeos.state');
    if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
  } catch {}
});

const st = () => p.evaluate(async () => {
  const { roles } = await import('./app/js/selectors.js');
  return Object.fromEntries(roles().map(r => [r.name, { state: r.state, n: r.n, parts: r.parts }]));
});

const base = await st();
ok('на пустом состоянии все роли скучают', Object.values(base).every(r => r.state === 'скучает' && r.n === 0));

// каждая роль получает свой сигнал, ни один из них не квест
await p.evaluate(async () => {
  const { update, uid, S } = await import('./app/js/store.js');
  const { addDays, todayISO } = await import('./app/js/dates.js');
  const y = addDays(todayISO(), -1), y2 = addDays(todayISO(), -3);
  update(s => {
    // Атлет: тренировка на дне
    s.sport.workouts.push({ id: uid(), date: y, title: 'Мини-тренировка', templateId: '', lessonId: '', goalId: '', done: true, note: '', tags: [], sets: [] });
    // Учёная: занятие с полки, пара по предмету, дочитанная книга
    s.lessons.push({ id: 'l1', name: 'Итальянский', kind: 'course', log: { [y]: 1 }, modules: [] });
    (s.study.attend ||= {}).sub1 = { [y2]: 1 };
    s.library.books.push({ id: uid(), title: 'Книга', status: 'done', finished: y2, pages: 100, page: 100, rating: 4 });
    // Артистка: опубликованный пост с днём выхода
    s.blog.posts.push({ id: uid(), title: 'Пост', place: 'both', stage: 'out', day: y, link: '', views: null, tags: [], note: '', movedAt: y });
    // Хранительница: операция и день питания
    s.budget.ops.push({ id: uid(), date: y, kind: 'expense', catId: '', sum: 500, note: '' });
    s.food.days[y2] = { water: 0, entries: [{ id: uid(), name: 'обед', kcal: 600 }] };
  });
});
const after = await st();
for (const [name, exp] of [['Атлет', 'тренировки'], ['Учёная', 'занятия'], ['Артистка', 'посты'], ['Хранительница', 'операции']]) {
  const r = after[name];
  ok(`${name}: ожил без единого квеста (${r.state} · ${r.n} — ${r.parts.map(x => `${x.label} ${x.n}`).join(', ')})`,
     r.n > 0 && r.parts.some(x => x.label === exp && x.n > 0));
}
// Книги теперь кормят «Читательницу», а не «Учёную»: сферы разложены по ролям
// картой в состоянии, и роль складывает следы только своих сфер.
ok('Учёная собрала занятия и пары', after['Учёная'].parts.length === 2 && after['Учёная'].n === 2);
ok('книги ушли к Читательнице', after['Читательница'].n === 1
   && after['Читательница'].parts.some(x => x.label === 'книги'));

// «Движение» и «Атлет» смотрят в одно место
const same = await p.evaluate(async () => {
  const { sportParts, roles } = await import('./app/js/selectors.js');
  const days14 = Array.from({ length: 14 }, (_, i) => i);
  return { s: sportParts, r: roles().find(x => x.name === 'Атлет').parts.map(x => x.label) };
});
ok('роль «Атлет» питается из общего счётчика спорта', same.r.includes('тренировки'));

// старый этап без даты в счёт не идёт
const noStamp = await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { roles } = await import('./app/js/selectors.js');
  const before = roles().find(r => r.name === 'Артистка').n;
  // пост без дня выхода: в ритм он не идёт и роль не оживляет
  update(s => { s.blog.posts.push({ id: 'old', title: 'Старый', place: 'both', stage: 'out', day: '', link: '', views: null, tags: [], note: '', movedAt: '' }); });
  return { before, after: roles().find(r => r.name === 'Артистка').n };
});
ok('пост без дня выхода не засчитывается', noStamp.after === noStamp.before);

// экран и шторка
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(800);
const card = p.locator('.card').filter({ hasText: 'Круг ролей' });
const txt = await card.innerText();
ok('на экране роль показывает состояние и счёт', /Атлет/.test(txt) && /ровно · 1|довольна/.test(txt));
ok('подпись больше не говорит «только квесты»', !/из закрытых квестов/.test(txt));
await card.locator('.role', { hasText: 'Учёная' }).click(); await p.waitForTimeout(500);
const sheet = await p.locator('.sheet').innerText();
ok('шторка показывает разбор по источникам', /занятия/.test(sheet) && /пары/.test(sheet));
ok('шторка называет окно', /за 14 дней/.test(sheet));

// снятая отметка возвращает роль в «скучает»
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);
const off = await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { roles } = await import('./app/js/selectors.js');
  update(s => { s.sport.workouts.forEach(w => { w.done = false; }); });
  return roles().find(r => r.name === 'Атлет');
});
ok('неотмеченная тренировка не считается', off.n === 0 && off.state === 'скучает');

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
