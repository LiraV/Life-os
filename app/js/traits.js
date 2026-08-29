// Черты персонажа. Каждая — не украшение, а правило: у неё есть эффект,
// который читают экраны и Летописец. Часть выдают тесты, часть персонаж
// зарабатывает сам по фактам, а часть берётся из параметров профиля.
//
// Эффекты описаны данными, а не кодом по экранам: так их видно все разом.

import { S, energyOn } from './store.js';
import { g } from './gender.js';
import { todayISO, addDays, monthKey, addMonths, weekDates } from './dates.js';

/** Группы: внутри взаимоисключающей группы держится одна черта. */
export const GROUPS = {
  motive: { name: 'Что двигает', exclusive: true },
  rhythm: { name: 'Ритм суток', exclusive: true },
  pace: { name: 'Темп', exclusive: true },
  social: { name: 'Как восстанавливаюсь', exclusive: true },
  path: { name: 'Заработанное', exclusive: false },
};

/**
 * effect — что именно меняет черта:
 *   show   'visual' | 'numbers' | 'why'   как показывать прогресс
 *   tone   'warm' | 'brief' | 'meaning' | 'spark'   голос Летописца
 *   rest   'quiet' | 'people'             какой отдых предлагать
 *   peak   'morning' | 'evening'          когда ставить тяжёлое
 *   suggest 'new'                         раз в месяц предлагать незнакомое
 */
export const TRAITS = [
  // ── что двигает: из теста «Мотивация» ──
  { id: 'aesthete', name: 'Эстет достижений', icon: '✦', group: 'motive', source: 'test',
    desc: 'Двигает форма, а не счётчик.',
    effect: { show: 'visual', tone: 'warm' },
    does: 'На «Я» вместо процентов — награды и жемчужина.' },
  { id: 'racer', name: 'Соревновательница', icon: '▲', group: 'motive', source: 'test',
    desc: 'Двигает видимый рост.',
    effect: { show: 'numbers', tone: 'brief' },
    does: 'Везде проценты и сравнение с прошлой неделей.' },
  { id: 'keeper', name: 'Хранительница смысла', icon: '❦', group: 'motive', source: 'test',
    desc: 'Двигает «зачем».',
    effect: { show: 'why', tone: 'meaning' },
    does: 'Цепочка «зачем» видна прямо в квесте.' },
  { id: 'explorer', name: 'Исследовательница', icon: '✧', group: 'motive', source: 'test',
    desc: 'Двигает новизна.',
    effect: { suggest: 'new', tone: 'spark' },
    does: 'Раз в месяц Летописец предлагает попробовать незнакомое.' },

  // ── ритм суток: из теста «Хронотип» и профиля ──
  { id: 'owl', name: 'Сова', icon: '☾', group: 'rhythm', source: 'profile',
    desc: 'Разгон к вечеру.', effect: { peak: 'evening' }, does: 'Кривая дня и совет про пик.' },
  { id: 'lark', name: 'Жаворонок', icon: '☀', group: 'rhythm', source: 'profile',
    desc: 'Пик утром.', effect: { peak: 'morning' }, does: 'Кривая дня и совет про пик.' },
  { id: 'floating', name: 'Плавающий ритм', icon: '≈', group: 'rhythm', source: 'profile',
    desc: 'Ритм меняется.', effect: {}, does: 'Летописец ориентируется на отметку энергии.' },

  // ── темп: из ползунка «Активность» ──
  { id: 'sprinter', name: 'Спринтер', icon: '⚡', group: 'pace', source: 'profile',
    desc: 'Короткие рывки, много за раз.', effect: { load: 'high' },
    does: 'Норма дня выше, Летописец реже говорит о перегрузе.' },
  { id: 'marathoner', name: 'Марафонец', icon: '∞', group: 'pace', source: 'profile',
    desc: 'Ровно и понемногу.', effect: { load: 'low' },
    does: 'Норма дня ниже, перегруз замечается раньше.' },

  // ── как восстанавливаюсь: из ползунка «Интроверсия» ──
  { id: 'quiet', name: 'Нужна тишина', icon: '◦', group: 'social', source: 'profile',
    desc: 'Силы возвращает одиночество.', effect: { rest: 'quiet' },
    does: 'После тяжёлого дня предлагает тихий отдых.' },
  { id: 'social', name: 'Заряжаюсь от людей', icon: '◍', group: 'social', source: 'profile',
    desc: 'Силы возвращают встречи.', effect: { rest: 'people' },
    does: 'После тяжёлого дня предлагает увидеться с кем-то.' },

  // ── заработанное: персонаж получает сам ──
  { id: 'earlybird', name: 'Ранняя пташка', icon: '🌤', group: 'path', source: 'observed',
    desc: 'Утро оказалось твоим временем.', effect: { peak: 'morning' },
    how: 'Семь дней с энергией выше 65',
    check: () => energyStreak(65, 7) },
  { id: 'steady', name: 'Постоянная', icon: '◆', group: 'path', source: 'observed',
    desc: 'Ритм держится сам.', effect: { tone: 'warm' },
    how: 'Привычка с закрытой нормой три недели подряд',
    check: () => habitStreakWeeks(3) },
  { id: 'returner', name: 'Возвращается', icon: '↺', group: 'path', source: 'observed',
    desc: 'Пауза — не конец.', effect: {},
    how: 'Вернуться к занятию после перерыва в две недели',
    check: () => returnedAfterPause(14) },
  { id: 'finisher', name: 'Доводит до конца', icon: '✓', group: 'path', source: 'observed',
    desc: 'Закрытые цели, а не начатые.', effect: {},
    how: 'Закрыть три цели',
    check: () => S.goals.filter(g => g.done).length >= 3 },
  { id: 'curious', name: 'Любознательная', icon: '❋', group: 'path', source: 'observed',
    desc: 'Учиться нескольким вещам сразу.', effect: { suggest: 'new' },
    how: 'Три занятия на полке обучения',
    check: () => S.lessons.filter(l => !l.archived).length >= 3 },
  { id: 'writer', name: 'Летописица', icon: '✎', group: 'path', source: 'observed',
    desc: 'Записанное остаётся.', effect: { tone: 'meaning' },
    how: 'Десять записей в дневнике',
    check: () => S.diary.length >= 10 },
  { id: 'athlete', name: 'Атлетичная', icon: '❯', group: 'path', source: 'observed',
    desc: 'Тело в деле.', effect: {},
    how: 'Двенадцать спортивных событий за тридцать дней',
    check: () => sportEvents(30) >= 12 },
  { id: 'saver', name: 'Копит', icon: '◈', group: 'path', source: 'observed',
    desc: 'Откладывать вошло в привычку.', effect: {},
    how: 'Пополнять копилку три месяца подряд',
    check: () => savedMonths(3) },
  { id: 'planner', name: 'Планировщица', icon: '▤', group: 'path', source: 'observed',
    desc: 'У месяцев есть форма.', effect: {},
    how: 'Цели месяца три месяца подряд',
    check: () => plannedMonths(3) },
  { id: 'caretaker', name: 'Заботится о себе', icon: '♡', group: 'path', source: 'observed',
    desc: 'Замечать себя — тоже дело.', effect: { rest: 'quiet' },
    how: 'Десять дней подряд отмечать энергию',
    check: () => energyStreak(0, 10) },
];

export const byId = id => TRAITS.find(t => t.id === id);
export const hasTrait = id => (S.user.traits || []).includes(id);
export const ownedTraits = () => (S.user.traits || []).map(byId).filter(Boolean);

/** Сводный эффект: последняя черта в списке перебивает предыдущие по тому же ключу. */
export function effects() {
  return ownedTraits().reduce((acc, t) => ({ ...acc, ...(t.effect || {}) }), {});
}

// ── проверки заработанного ──────────────────────────────────────
function energyStreak(min, days) {
  for (let i = 0; i < days; i++) {
    const v = energyOn(addDays(todayISO(), -i));
    if (v == null || v < min) return false;
  }
  return true;
}

function habitStreakWeeks(weeks) {
  return S.habits.filter(hb => !hb.archived).some(hb => {
    const target = Math.max(1, Number(hb.target) || 1);
    for (let w = 0; w < weeks; w++) {
      const days = weekDates(addDays(todayISO(), -7 * w));
      // Неделя засчитана, если норма закрыта хотя бы в пяти днях из семи.
      const ok = days.filter(d => (Number(hb.log?.[d]) || 0) >= target).length >= 5;
      if (!ok) return false;
    }
    return true;
  });
}

function returnedAfterPause(gap) {
  return S.lessons.some(l => {
    const dates = Object.keys(l.log || {}).filter(d => l.log[d]).sort();
    return dates.some((d, i) => i > 0 && (new Date(d) - new Date(dates[i - 1])) / 86400000 >= gap);
  });
}

function sportEvents(days) {
  const from = addDays(todayISO(), -(days - 1));
  const quests = Object.entries(S.quests).filter(([d]) => d >= from)
    .reduce((a, [, list]) => a + list.filter(q => q.done && q.sphere === 'sport').length, 0);
  const lessons = S.lessons.filter(l => l.alsoSport)
    .reduce((a, l) => a + Object.keys(l.log || {}).filter(d => d >= from && l.log[d]).length, 0);
  return quests + lessons;
}

function savedMonths(n) {
  const months = Array.from({ length: n }, (_, i) => addMonths(monthKey(todayISO()), -i));
  return months.every(m => S.budget.ops.some(o => o.kind === 'save' && o.sum > 0 && (o.date || '').startsWith(m)));
}

function plannedMonths(n) {
  const months = Array.from({ length: n }, (_, i) => addMonths(monthKey(todayISO()), -i));
  return months.every(m => S.goals.some(g => !g.archived && g.horizon === 'month' && g.period === m));
}

/** Черты из профиля: их не выдают, они всегда соответствуют ползункам. */
export function profileTraits() {
  const u = S.user;
  return [
    { rhythm: { 'сова': 'owl', 'жаворонок': 'lark', 'плавает': 'floating' }[u.chronotype] || 'floating' }.rhythm,
    // Темп — отдельный вопрос, а не побочный смысл ползунка «Активность»:
    // «много двигаюсь» и «работаю рывками» — разные вещи. Не выбрано —
    // черты нет: выдумывать за человека его темп незачем.
    u.pace === 'sprint' ? 'sprinter' : u.pace === 'even' ? 'marathoner' : null,
    Number(u.introversion) > 60 ? 'quiet' : 'social',
  ].filter(Boolean);
}

/**
 * Привести список черт к порядку: профильные пересчитываются, внутри
 * взаимоисключающей группы остаётся одна. Возвращает список новых заработанных.
 */
export function reconcile(s) {
  const owned = new Set(s.user.traits || []);

  // Профильные всегда пересобираем из ползунков.
  ['rhythm', 'pace', 'social'].forEach(g => {
    TRAITS.filter(t => t.group === g).forEach(t => owned.delete(t.id));
  });
  profileTraits().forEach(id => owned.add(id));

  // Заработанные: выдаём один раз и не отбираем — прогресс не отматывается назад.
  const fresh = [];
  TRAITS.filter(t => t.source === 'observed').forEach(t => {
    if (owned.has(t.id)) return;
    let ok = false;
    try { ok = !!t.check(); } catch { ok = false; }
    if (ok) { owned.add(t.id); fresh.push(t); }
  });

  // Внутри взаимоисключающей группы держим последнюю добавленную.
  Object.entries(GROUPS).filter(([, g]) => g.exclusive).forEach(([key]) => {
    const inGroup = TRAITS.filter(t => t.group === key && owned.has(t.id)).map(t => t.id);
    if (inGroup.length > 1) inGroup.slice(0, -1).forEach(id => owned.delete(id));
  });

  s.user.traits = TRAITS.filter(t => owned.has(t.id)).map(t => t.id);
  return fresh;
}

// ── род названий ────────────────────────────────────────────────
// Часть черт, ролей и титулов названа в женском роде. Мужские формы лежат рядом
// словарём, а не выводятся правилом: правила для русского рода нет.
const MASC = {
  'Соревновательница': 'Соревнователь',
  'Хранительница смысла': 'Хранитель смысла',
  'Исследовательница': 'Исследователь',
  'Постоянная': 'Постоянный',
  'Любознательная': 'Любознательный',
  'Летописица': 'Летописец',
  'Атлетичная': 'Атлетичный',
  'Планировщица': 'Планировщик',
  'Учёная': 'Учёный',
  'Артистка': 'Артист',
  'Хранительница': 'Хранитель',
  'Хозяйка недели': 'Хозяин недели',
  'Хранительница глав': 'Хранитель глав',
};

/** Название в роде профиля. Незнакомое имя отдаём как есть. */
export const nameOf = x => {
  const n = typeof x === 'string' ? x : (x?.name || '');
  return MASC[n] ? g(n, MASC[n]) : n;
};

// ── титулы уровня ───────────────────────────────────────────────
const TITLES = [
  'Новая глава', 'Собирает ритм', 'Хозяйка недели', 'Держит курс', 'Хранительница глав',
  'Мастер ритма', 'Автор года', 'Тихая сила', 'Легенда себя',
];
export const titleFor = lv => nameOf(TITLES[Math.min(TITLES.length - 1, Math.max(0, lv - 1))]);
