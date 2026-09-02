// Виджет календаря для домашнего экрана. Сам Scriptable здесь не запустишь,
// но считает он чистыми функциями — их и проверяем на настоящем состоянии
// приложения. Ошибка в счёте дней на домашнем экране заметна сразу и объяснить
// её нечем: виджет молча покажет не тот день.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { monthGrid, busyByDate, todayList, iso } = require('../widget/lifeos-widget.js');

let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };

// ── сетка месяца ────────────────────────────────────────────────
// Сентябрь 2026 начинается во вторник: первая клетка пустая.
const sep = monthGrid(2026, 8);
ok('неделя начинается с понедельника', sep[0] === null && sep[1] === 1, JSON.stringify(sep.slice(0, 3)));
ok('в сетке целые недели', sep.length % 7 === 0, String(sep.length));
ok('все 30 дней на месте', sep.filter(Boolean).length === 30, String(sep.filter(Boolean).length));
// Февраль 2027 начинается в понедельник — пустых клеток в начале нет.
const feb = monthGrid(2027, 1);
ok('месяц с понедельника — без пустой клетки', feb[0] === 1, String(feb[0]));
ok('и 28 дней', feb.filter(Boolean).length === 28, String(feb.filter(Boolean).length));

// ── занятость дней ──────────────────────────────────────────────
const state = {
  quests: {
    '2026-09-03': [{ title: 'Черновик', done: false }, { title: 'Сделано', done: true }],
    '2026-09-04': [{ title: 'Созвон', done: false }],
    '2026-10-01': [{ title: 'Чужой месяц', done: false }],
  },
  sport: { workouts: [{ date: '2026-09-03', done: false }, { date: '2026-09-05', done: true }] },
  work: { tasks: [
    { day: '2026-09-07', column: 'rk-mod', title: 'Модерация' },
    { day: '2026-09-08', column: 'done', title: 'Закрытая' },
  ] },
  study: { tasks: [{ due: '2026-09-10', stage: 'todo', title: 'Глава 3' }, { due: '2026-09-11', stage: 'done' }] },
  blog: { posts: [{ day: '2026-09-12', stage: 'ready' }, { day: '2026-09-13', stage: 'out' }] },
};
const busy = busyByDate(state, '2026-09');
ok('закрытые квесты не занимают день', busy['2026-09-03'] === 2, JSON.stringify(busy['2026-09-03']));
ok('тренировка добавляет своё', busy['2026-09-03'] === 2);
ok('сделанная тренировка не считается', !busy['2026-09-05'], String(busy['2026-09-05']));
ok('рабочая задача с днём считается', busy['2026-09-07'] === 1);
ok('а закрытая колонка — нет', !busy['2026-09-08']);
ok('задание учёбы со сроком считается', busy['2026-09-10'] === 1);
ok('сданное — нет', !busy['2026-09-11']);
ok('готовый пост считается', busy['2026-09-12'] === 1);
ok('вышедший — нет', !busy['2026-09-13']);
ok('чужой месяц не попадает в сетку', !busy['2026-10-01'], JSON.stringify(Object.keys(busy)));

// ── список на сегодня ───────────────────────────────────────────
const day = {
  quests: { '2026-09-03': [
    { title: 'Вечер', time: '19:00', done: false },
    { title: 'Утро', time: '08:30', done: false },
    { title: 'Без времени', time: '', done: false },
    { title: 'Готово', time: '10:00', done: true },
  ] },
  sport: { workouts: [{ date: '2026-09-03', time: '12:00', title: 'Ноги', done: false }] },
  work: { tasks: [{ day: '2026-09-03', column: 'l1', title: 'Расчёт МП' }] },
  study: { tasks: [{ due: '2026-09-03', stage: 'todo', title: 'Глава 3' }] },
};
const rows = todayList(day, '2026-09-03');
ok('сделанное в список не идёт', !rows.some(r => r.text === 'Готово'), rows.map(r => r.text).join(', '));
// Три квеста без закрытого, тренировка, рабочая задача и задание учёбы.
ok('всё остальное собрано', rows.length === 6, String(rows.length));
ok('самое раннее первым', rows[0].text === 'Утро', rows.map(r => `${r.time || '—'} ${r.text}`).join(' · '));
ok('без времени — в конец', rows[rows.length - 1].time === '', JSON.stringify(rows[rows.length - 1]));
ok('пустой день даёт пустой список', todayList(day, '2026-09-09').length === 0);

// ── устойчивость к неполным данным ──────────────────────────────
// Виджет читает копию из облака: там может не быть веток, которых у человека нет.
let survived = true;
try {
  busyByDate({}, '2026-09');
  busyByDate({ quests: null, sport: {}, work: { tasks: null } }, '2026-09');
  todayList({}, '2026-09-03');
} catch (e) { survived = false; console.log('   упало на:', e.message); }
ok('пустое состояние не роняет виджет', survived);

// ── дата собирается по местному времени, а не по UTC ─────────────
// Ночью разница в часовом поясе сдвинула бы день на вчерашний.
const d = new Date(2026, 8, 3, 0, 30);
ok('дата берётся локальная', iso(d) === '2026-09-03', iso(d));

console.log(bad ? `✗ ошибок: ${bad}` : '✓ виджет считает верно');
process.exit(bad ? 1 : 0);
