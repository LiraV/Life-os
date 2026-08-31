// Миграция каждой прошлой версии на текущую — за секунды, без прогона экранов.
// Это единственная проверка, которая ловит потерю данных, поэтому она в быстром наборе.
import { chromium } from './pw.mjs';
const b = await chromium.launch();
// Воркер в этой проверке не участвует, а его запросы за шрифтами идут мимо
// перехвата страницы и висят до таймаута — из-за этого прогон тянулся минутами.
const ctx = await b.newContext({ locale: 'ru-RU', serviceWorkers: 'block' });
// Шрифты недоступны и висят по 13 секунд на каждой загрузке — гасим их сразу.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };
// Отключённые шрифты дают свою ошибку загрузки — она не про приложение.
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
// Текущую версию спрашиваем у самого приложения: иначе тест ломается
// от каждого обновления формата, хотя проверяет он не номер.
// Копии убираем вместе с сохранением: иначе это уже не «новый человек», а
// «данные потерялись», и приложение справедливо спросит, а не начнёт молча.
await p.evaluate(() => (() => {
  localStorage.removeItem('lifeos.state');
  localStorage.removeItem('lifeos.state.prev');
  localStorage.removeItem('lifeos.state.rescue');
})());
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(400);
const NOW = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).v);
console.log('текущая версия формата:', NOW);

/** Слепок «живого» состояния: то, что человеку дороже всего. */
const mine = v => ({
  v, onboarded: true, ui: { tips: 'off' },
  user: { name: 'Лера', xp: 952, sex: 'f', chronotype: 'сова' },
  quests: { '2026-08-20': [{ id: 'q1', title: 'Квест', done: true, sphere: 'work' }] },
  energy: { '2026-08-20': 60 },
  diary: [{ id: 'd1', date: '2026-08-20', text: 'запись' }],
  goals: [{ id: 'g1', title: 'Цель', horizon: 'year', period: '2026', target: 12, current: 3 }],
  habits: [{ id: 'h1', name: 'Вода 2 литра', target: 2000, step: 250, log: { '2026-08-20': 1500 } }],
  health: { days: { '2026-08-01': true }, measures: [{ id: 'm', date: '2026-08-01', weight: 60 }], symptoms: [] },
  care: { items: [{ id: 'c1', name: 'Кровь на литий', group: 'health', every: 3, log: ['2026-07-01'] }], pet: { name: 'Бусик' } },
  library: { books: [{ id: 'b1', title: 'Книга', status: 'done', finished: '2026-08-01' }] },
  travel: { visits: [{ id: 'v1', code: 'TR', year: 2025 }] },
  budget: { ops: [{ id: 'o1', date: '2026-08-01', kind: 'expense', sum: 500 }], cats: { expense: [], income: [] }, vaults: [] },
  mind: [{ id: 'p1', date: '2026-08-20', key: 'box', minutes: 5, before: 70, after: 40 }],
  work: {
    jobs: [{ id: 'j1', company: 'Okkam', title: 'Спец', kind: 'job', start: '2025-09-01', end: '', salary: 30000,
             sched: { days: [0,1,2,3,4], start: '11:00', end: '18:00', lunch: 60 }, officeNorm: 8, vacationDays: 28 }],
    days: { '2026-08-20': { j1: { type: 'work', hours: 6, where: 'office', note: '' } } },
    tasks: [{ id: 't1', title: 'Задача', jobId: 'j1', stage: 'queue', due: '2026-09-08' }],
    wins: [{ id: 'w1', date: '2026-08-01', title: 'Победа', jobId: 'j1' }],
  },
});

/** Что должно уцелеть при любой миграции. */
const check = s => ({
  name: s.user?.name, xp: s.user?.xp,
  quests: Object.keys(s.quests || {}).length, diary: (s.diary || []).length,
  goals: (s.goals || []).length, habits: (s.habits || []).length,
  habitLog: Object.keys(s.habits?.[0]?.log || {}).length,
  period: Object.keys(s.health?.days || {}).length, measures: (s.health?.measures || []).length,
  care: (s.care?.items || []).length, pet: s.care?.pet?.name,
  books: (s.library?.books || []).length, trips: (s.travel?.visits || []).length,
  ops: (s.budget?.ops || []).length, mind: (s.mind || []).length,
  jobs: (s.work?.jobs || []).length, wdays: Object.keys(s.work?.days || {}).length,
  tasks: (s.work?.tasks || []).length, wins: (s.work?.wins || []).length,
});

// Каждая версия, начиная с той, где появилось хоть что-то из этого списка.
for (let v = 27; v < NOW; v++) {
  await p.evaluate(x => localStorage.setItem('lifeos.state', JSON.stringify(x)), mine(v));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(450);
  const s = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
  const r = check(s);
  const lost = Object.entries(r).filter(([k, val]) =>
    (typeof val === 'number' && val === 0) || (typeof val === 'string' && !val));
  ok(`v${v} → v${s.v}: ничего не потеряно${lost.length ? ' — потеряно: ' + lost.map(x => x[0]).join(', ') : ''}`,
     s.v === NOW && !lost.length);
}

ok('в консоли нет ошибок', !errs.length || (console.log('  ', errs.slice(0, 2)), false));
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad ? 1 : 0);
