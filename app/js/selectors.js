// Производные значения. Ничего не хранят — считают из состояния,
// чтобы прогресс, потребности и реплики Летописца шли из реальных данных.

import { S, SPHERES, level, levelFloor } from './store.js';
import { effects, hasTrait, byId as traitById } from './traits.js';
import { COUNTRIES, countryBy, REGIONS } from './countries.js';
import { todayISO, addDays, weekDates, weekKey, monthDates, diffDays, dayShort, quarterMonths, addMonths, monthKey, daysInMonth, dowIndex, DOW, startOfWeek } from './dates.js';

export const questsOn = date => S.quests[date] || [];
export const sphereOf = key => SPHERES.find(s => s.key === key);

/** Кривая энергии по хронотипу: 6 блоков от утра к ночи. */
export const ENERGY_BLOCKS = ['7–10', '10–13', '13–16', '16–19', '19–22', '22–01'];
const CURVES = {
  'сова':       [22, 40, 46, 62, 95, 78],
  'жаворонок':  [82, 95, 72, 54, 38, 18],
  'плавает':    [48, 70, 64, 72, 62, 36],
};
/** Заработанная «Ранняя пташка» перебивает хронотип: факты важнее анкеты. */
export const energyCurve = () => {
  const e = effects();
  if (e.peak === 'morning') return CURVES['жаворонок'];
  if (e.peak === 'evening') return CURVES['сова'];
  return CURVES[S.user.chronotype] || CURVES['плавает'];
};
export const peakBlock = () => { const c = energyCurve(); return c.indexOf(Math.max(...c)); };
export const peakLabel = () => ENERGY_BLOCKS[peakBlock()];

export function energyLabel(v) {
  if (v <= 20) return 'на нуле';
  if (v <= 45) return 'раскачиваюсь';
  if (v <= 70) return 'ровно';
  if (v <= 88) return 'хорошо';
  return 'огонь';
}

export const levelInfo = () => {
  const xp = S.user.xp, lv = level(xp), from = levelFloor(lv), to = levelFloor(lv + 1);
  return { lv, xp, from, to, pct: Math.round(((xp - from) / Math.max(1, to - from)) * 100) };
};

// ── цели: год → квартал → месяц ─────────────────────────────────
export const HORIZONS = { year: 'Год', quarter: 'Квартал', month: 'Месяц' };

/** Живые цели — всё, что не в архиве. Вычеркнутые сюда входят: вычёркивание —
 *  только пометка «в этом году не закрою», на расчёты оно не влияет. */
export const liveGoals = () => S.goals.filter(g => !g.archived);
export const goalsIn = (horizon, period) => liveGoals().filter(g => g.horizon === horizon && g.period === period);
export const goalById = id => S.goals.find(g => g.id === id);
export const goalChildren = id => liveGoals().filter(g => g.parentId === id);

export const isCounter = g => Number(g?.target) > 0;

/**
 * Счётчик цели: набранное ставит сама пользовательница. Автоматики тут нет —
 * тренировка лишь подписывается, к какой цели относится.
 */
export const counterOf = g => ({ current: Number(g.current) || 0, target: Number(g.target) || 0, unit: g.unit || '' });

/** Прогресс: «выполнено» перебивает всё, дальше счётчик, этапы, вложенные цели, вручную. */
export function goalProgress(goal, seen = new Set()) {
  if (!goal || seen.has(goal.id)) return 0;
  if (goal.done) return 100;
  if (isCounter(goal)) {
    const { current, target } = counterOf(goal);
    return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  }
  seen.add(goal.id);
  const steps = goal.steps || [];
  if (steps.length) return Math.round((steps.filter(x => x.done).length / steps.length) * 100);
  const kids = goalChildren(goal.id);
  if (kids.length) return Math.round(kids.reduce((a, k) => a + goalProgress(k, seen), 0) / kids.length);
  return Math.max(0, Math.min(100, goal.progress || 0));
}

const avg = list => list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;

export const goalSlots = g => Array.isArray(g.slots) ? g.slots : [];

/** Цели, положенные в этот период сверху — живут выше, но запланированы сюда. */
export const goalsPlannedIn = period => liveGoals().filter(g => g.period !== period && goalSlots(g).includes(period));

/** Цели года, которым ещё не назначен ни квартал, ни месяц. */
export const unplannedGoals = (horizon, period) => goalsIn(horizon, period).filter(g => !goalSlots(g).length);

/** Цели квартала: свои плюс положенные сюда; если пусто — месячные внутри него. */
export function quarterGoals(qk) {
  const own = [...goalsIn('quarter', qk), ...goalsPlannedIn(qk)];
  if (own.length) return own;
  return quarterMonths(qk).flatMap(ym => goalsIn('month', ym));
}

/** Цели месяца: свои плюс положенные сюда из квартала или года. */
export const monthGoals = ym => [...goalsIn('month', ym), ...goalsPlannedIn(ym)];
export const quarterProgress = qk => avg(quarterGoals(qk).map(g => goalProgress(g)));

/** Цели года, а если их нет — сводка по кварталам. */
export function yearProgress(y) {
  const own = goalsIn('year', String(y));
  if (own.length) return avg(own.map(g => goalProgress(g)));
  return avg(['Q1', 'Q2', 'Q3', 'Q4'].map(q => quarterProgress(`${y}-${q}`)).filter(x => x != null));
}

/** Куда ведёт цель: цепочка вверх до темы года. */
export function goalChain(id) {
  const out = [];
  let cur = goalById(id), guard = 0;
  while (cur && guard++ < 6) {
    out.push({ id: cur.id, title: cur.title, horizon: cur.horizon, period: cur.period });
    cur = cur.parentId ? goalById(cur.parentId) : null;
  }
  const last = out[out.length - 1];
  const year = last ? last.period.slice(0, 4) : null;
  const theme = year && S.years[year]?.theme;
  return { links: out, theme: theme || null };
}

/** Годы, о которых вообще есть что показать. */
export const goalYears = () => [...new Set(liveGoals().map(g => g.period.slice(0, 4)))];

// ── сферы ───────────────────────────────────────────────────────
export const sphereItems = key => (S.spheres[key] || {}).items || [];

export function sphereProgress(key) {
  const items = sphereItems(key);
  if (!items.length) return null;
  return Math.round((items.filter(i => i.done).length / items.length) * 100);
}

export function sphereStatus(key) {
  const items = sphereItems(key);
  if (!items.length) return 'пока пусто';
  const open = items.filter(i => !i.done);
  if (!open.length) return 'всё закрыто ✓';
  return open[0].title;
}

// ── неделя ──────────────────────────────────────────────────────
export const weekOf = date => S.weeks[weekKey(date)] || null;

export function weekStats(date) {
  const dates = weekDates(date);
  let total = 0, done = 0;
  dates.forEach(d => questsOn(d).forEach(q => { total++; if (q.done) done++; }));
  return { total, done, dates };
}

// ── привычки ────────────────────────────────────────────────────
export const habitTarget = hb => Math.max(1, Number(hb.target) || 1);
export const habitCount = (hb, date) => Math.max(0, Number(hb.log?.[date]) || 0);
export const habitDone = (hb, date) => habitCount(hb, date) >= habitTarget(hb);

export const liveHabits = () => S.habits.filter(hb => !hb.archived);

/** Полные дни месяца — те, где норма закрыта целиком. */
export const habitMonthCount = (hb, ym) => monthDates(ym).filter(d => habitDone(hb, d)).length;
/** Сколько всего раз за месяц — для большого трекера. */
export const habitMonthTotal = (hb, ym) => monthDates(ym).reduce((a, d) => a + habitCount(hb, d), 0);
export const habitWeekDone = (hb, date) => weekDates(date).filter(d => habitDone(hb, d)).length;

// ── спорт: тренировки и рекорды ─────────────────────────────────
/** Шаблоны тренировок: без дат, только название и состав. */
export const templates = () => S.sport.templates;
export const templateById = id => templates().find(t => t.id === id);
export const templateName = id => (templateById(id) || {}).name || '';

export const workoutsOn = date => S.sport.workouts.filter(w => w.date === date);

// ── пилюли тренировок ───────────────────────────────────────────
// Тренировка со временем меняется, а «пресс» остаётся прессом: считаем
// именно пилюли, поэтому статистика переживает смену программы.
export const sportTags = () => S.sport.tags || [];
export const tagById = id => sportTags().find(t => t.id === id);
export const tagName = id => (tagById(id) || {}).name || '';

/** Сколько раз за месяц была отмечена тренировка с этой пилюлей. */
export const tagMonthCount = (tagId, ym) => S.sport.workouts
  .filter(w => w.done && !w.measure && w.date.slice(0, 7) === ym && (w.tags || []).includes(tagId))
  .length;

/** Пилюля попадает в трекер, если в этом году она хоть раз встречалась. */
export const tagUsedIn = (tagId, year) => S.sport.workouts
  .some(w => w.done && !w.measure && w.date.slice(0, 4) === String(year) && (w.tags || []).includes(tagId));
export const exerciseById = id => S.sport.exercises.find(e => e.id === id);

/** Все результаты упражнения по датам — из подходов выполненных тренировок. */
export function exerciseHistory(id) {
  const out = [];
  // Результат — то, что отмечено сделанным: и тренировка целиком, и сам подход.
  // Запланированное, но не отмеченное, рекордом не считается.
  S.sport.workouts.filter(w => w.done).forEach(w => {
    (w.sets || []).filter(x => x.done && x.exerciseId === id && x.value != null && x.value !== '').forEach(x => {
      out.push({ date: w.date, value: Number(x.value), reps: Number(x.reps) || 1 });
    });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Что считать лучшим: вниз — меньше, вверх и «оба» — больше. */
export const betterOf = ex => (a, b) => (ex.dir === 'down' ? a < b : a > b);

/**
 * Рекорд, оба края и сдвиг за месяц. Крайние значения показываем всегда:
 * иногда важен максимум, иногда минимум, и заранее это не угадать.
 */
export function exerciseRecord(ex) {
  const hist = exerciseHistory(ex.id);
  if (!hist.length) return null;
  const better = betterOf(ex);
  const best = hist.reduce((acc, x) => (better(x.value, acc.value) ? x : acc), hist[0]);
  const vals = hist.map(x => x.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const last = hist[hist.length - 1];
  const monthAgo = addDays(todayISO(), -30);
  const older = hist.filter(x => x.date < monthAgo);
  const was = older.length ? older[older.length - 1].value : null;
  return {
    best: best.value, bestDate: best.date, last: last.value, lastDate: last.date,
    max, min, was, gain: was == null ? null : Number((last.value - was).toFixed(1)),
    improved: was == null ? null : better(last.value, was),
    count: hist.length,
  };
}

/** Лучший результат за месяц — строка в годовом трекере. */
export function exerciseMonthBest(ex, ym) {
  const list = exerciseHistory(ex.id).filter(x => x.date.startsWith(ym)).map(x => x.value);
  if (!list.length) return null;
  return ex.dir === 'down' ? Math.min(...list) : Math.max(...list);
}

/** Тренировки за период — идут в статистику спорта и в потребность «Движение».
 *  Замеры сюда не входят: измерить шпагат — не то же самое, что потренироваться. */
export const workoutsIn = days => S.sport.workouts.filter(w => w.done && !w.measure && days.includes(w.date));

// ── учёба: заведения, предметы, этапы ───────────────────────────
/** Одна лестница стадий на всё: простой этап просто перепрыгивает середину. */
export const STAGES = [
  { id: 'todo', name: 'Не начато', short: 'не начато' },
  { id: 'plan', name: 'План', short: 'план' },
  { id: 'draft', name: 'В работе', short: 'в работе' },
  { id: 'sent', name: 'У преподавателя', short: 'отправлено' },
  { id: 'fixes', name: 'Правки', short: 'правки' },
  { id: 'done', name: 'Сдано', short: 'сдано' },
];
export const stageOf = id => STAGES.find(s => s.id === id) || STAGES[0];
export const stageIndex = id => Math.max(0, STAGES.findIndex(s => s.id === id));

export const livePlaces = () => S.study.places;
export const liveSubjects = () => S.study.subjects.filter(x => !x.archived);
export const subjectsOf = placeId => liveSubjects().filter(x => x.placeId === placeId);
export const subjectById = id => S.study.subjects.find(x => x.id === id);
export const tasksOf = subjectId => S.study.tasks.filter(t => t.subjectId === subjectId);

/** Этапы живых предметов — доска показывает только их. */
export const liveTasks = () => {
  const ids = new Set(liveSubjects().map(x => x.id));
  return S.study.tasks.filter(t => ids.has(t.subjectId));
};

export const taskSubject = t => subjectById(t.subjectId) || { name: '—' };

/** Сколько дней этап ждёт ответа: считаем с момента перевода в «у преподавателя». */
export const waitingDays = t => (t.stage === 'sent' && t.stageAt ? diffDays(todayISO(), t.stageAt) : null);

/** Прогресс предмета — по стадиям всех этапов, а не по числу галочек. */
export function subjectProgress(id) {
  const list = tasksOf(id);
  if (!list.length) return null;
  const max = STAGES.length - 1;
  return Math.round(list.reduce((a, t) => a + stageIndex(t.stage) / max, 0) / list.length * 100);
}

/** Что висит прямо сейчас: просроченное, ожидание, ближайшие сроки, в работе. */
export function studyNow(days = 14) {
  const t = todayISO();
  const soon = addDays(t, days);
  const open = liveTasks().filter(x => x.stage !== 'done');
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999');
  return {
    overdue: open.filter(x => x.due && x.due < t).sort(byDue),
    waiting: open.filter(x => x.stage === 'sent').sort((a, b) => (waitingDays(b) || 0) - (waitingDays(a) || 0)),
    due: open.filter(x => x.due && x.due >= t && x.due <= soon).sort(byDue),
    inWork: open.filter(x => ['plan', 'draft', 'fixes'].includes(x.stage)).sort(byDue),
    open,
  };
}

// ── обучение: курсы и практики ──────────────────────────────────
export const liveLessons = () => S.lessons.filter(l => !l.archived);
export const practices = () => liveLessons().filter(l => l.kind === 'practice');

export const lessonDates = l => Object.keys(l.log || {}).filter(d => l.log[d]).sort();
export const lessonMonth = (l, ym) => lessonDates(l).filter(d => d.startsWith(ym)).length;
export const lessonLast = l => lessonDates(l).filter(d => d <= todayISO()).pop() || null;
/** Сколько дней назад было последнее занятие; null — если ни одного. */
export const lessonAgo = l => { const d = lessonLast(l); return d ? diffDays(todayISO(), d) : null; };

/** Модуль без уроков считается сам за себя, с уроками — по своим урокам. */
export const moduleUnits = m => (m.lessons || []).length || 1;
export const moduleDone = m => ((m.lessons || []).length
  ? (m.lessons || []).filter(x => x.done).length
  : (m.done ? 1 : 0));
export const moduleFull = m => ((m.lessons || []).length
  ? (m.lessons || []).every(x => x.done)
  : !!m.done);

export const courseProgress = l => {
  const mods = l.items || [];
  if (!mods.length) return null;
  const total = mods.reduce((a, m) => a + moduleUnits(m), 0);
  const done = mods.reduce((a, m) => a + moduleDone(m), 0);
  return Math.round((done / total) * 100);
};

/** Занятия, которые пользователь просил считать ещё и спортом. */
export function sportLessonSessions(days) {
  return liveLessons().filter(l => l.alsoSport)
    .reduce((a, l) => a + lessonDates(l).filter(d => days.includes(d)).length, 0);
}

// ── тело ────────────────────────────────────────────────────────
/** Пропуск в один-два дня внутри месячных — всё ещё те же месячные, а не новый цикл. */
const MERGE_GAP = 3;

/** Отмеченные дни, свёрнутые в блоки: [{ start, end, len, days }] по возрастанию. */
export function periodBlocks() {
  const marked = Object.keys(S.health.days || {}).filter(d => S.health.days[d]).sort();
  const blocks = [];
  marked.forEach(d => {
    const last = blocks[blocks.length - 1];
    if (last && diffDays(d, last.end) <= MERGE_GAP) { last.end = d; last.days.push(d); }
    else blocks.push({ start: d, end: d, days: [d] });
  });
  return blocks.map(b => ({ ...b, len: diffDays(b.end, b.start) + 1 }));
}

/** Полная картина цикла — всё считается из отмеченных дней, ничего не зашито. */
export function cycleInfo() {
  const blocks = periodBlocks();
  if (!blocks.length) return null;

  const starts = blocks.map(b => b.start);
  const gaps = starts.slice(1).map((s, i) => diffDays(s, starts[i])).filter(g => g >= 15 && g <= 60);
  const avgCycle = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
  const avgLen = Math.round(blocks.reduce((a, b) => a + b.len, 0) / blocks.length);

  const t = todayISO();
  // Последний блок, который уже начался: будущие отметки не считаем текущим циклом.
  const past = blocks.filter(b => b.start <= t);
  const last = past[past.length - 1];
  if (!last) return { blocks, avgCycle, avgLen, gaps, day: null, next: blocks[0].start };

  const day = diffDays(t, last.start) + 1;
  const ovulation = Math.max(7, avgCycle - 14);
  const bleeding = !!S.health.days[t] || day <= last.len;

  let phase, hint;
  if (bleeding) { phase = 'менструация'; hint = 'мягкие дни — тяжёлое лучше отложить'; }
  else if (day < ovulation - 2) { phase = 'фолликулярная'; hint = 'сил прибавляется — хорошо начинать новое'; }
  else if (day <= ovulation + 1) { phase = 'овуляция'; hint = 'пик — самое время для сложного'; }
  else if (day >= avgCycle - 4) { phase = 'перед циклом'; hint = 'скоро начнётся — планируй мягче'; }
  else { phase = 'лютеиновая'; hint = 'ровное время, силы понемногу убывают'; }

  return {
    blocks, avgCycle, avgLen, gaps, last, day, phase, hint, bleeding,
    pct: Math.min(100, Math.round((day / avgCycle) * 100)),
    next: addDays(last.start, avgCycle),
    daysToNext: diffDays(addDays(last.start, avgCycle), t),
  };
}

export function measureDeltas() {
  const list = [...S.health.measures].sort((a, b) => a.date.localeCompare(b.date));
  const cur = list[list.length - 1], prev = list[list.length - 2];
  const d = (f) => (cur && prev && cur[f] != null && prev[f] != null) ? +(cur[f] - prev[f]).toFixed(1) : null;
  return { cur, prev, list, delta: { weight: d('weight'), waist: d('waist'), hips: d('hips'), sleep: d('sleep') } };
}

// ── энергия ─────────────────────────────────────────────────────
export const energyDays = () => Object.keys(S.energy).filter(d => S.energy[d] != null).sort();
const mean = list => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);

/** Средняя энергия за месяц — для строки в годовом трекере. */
export const energyMonth = ym => mean(energyDays().filter(d => d.startsWith(ym)).map(d => S.energy[d]));

/** Последние N дней подряд: и пустые тоже, чтобы график не врал про пропуски. */
export function energyRecent(n = 30) {
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(todayISO(), -(n - 1 - i));
    return { date: d, value: S.energy[d] ?? null };
  });
}

/** Фаза цикла на произвольную дату — нужна, чтобы связать энергию с циклом. */
export function phaseOn(date) {
  const blocks = periodBlocks().filter(b => b.start <= date);
  if (!blocks.length) return null;
  const last = blocks[blocks.length - 1];
  const starts = periodBlocks().map(b => b.start);
  const gaps = starts.slice(1).map((x, i) => diffDays(x, starts[i])).filter(g => g >= 15 && g <= 60);
  const avgCycle = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
  const day = diffDays(date, last.start) + 1;
  if (day > avgCycle + 20) return null;                       // слишком давно — считать нечестно
  const ovulation = Math.max(7, avgCycle - 14);
  if (day <= last.len) return 'менструация';
  if (day < ovulation - 2) return 'фолликулярная';
  if (day <= ovulation + 1) return 'овуляция';
  if (day >= avgCycle - 4) return 'перед циклом';
  return 'лютеиновая';
}

const PHASE_ORDER = ['менструация', 'фолликулярная', 'овуляция', 'лютеиновая', 'перед циклом'];

/** Связки энергии: с фазой цикла и с днями, когда были занятия или спорт. */
export function energyStats(days = 90) {
  const from = addDays(todayISO(), -(days - 1));
  const marks = energyDays().filter(d => d >= from);
  if (!marks.length) return { count: 0 };

  const byPhase = {};
  marks.forEach(d => {
    const ph = phaseOn(d);
    if (!ph) return;
    (byPhase[ph] ||= []).push(S.energy[d]);
  });

  const active = new Set();
  liveLessons().forEach(l => lessonDates(l).forEach(d => active.add(d)));
  marks.forEach(d => { if (questsOn(d).some(q => q.done && q.sphere === 'sport')) active.add(d); });

  const withMove = marks.filter(d => active.has(d)).map(d => S.energy[d]);
  const without = marks.filter(d => !active.has(d)).map(d => S.energy[d]);

  return {
    count: marks.length,
    avg: mean(marks.map(d => S.energy[d])),
    phases: PHASE_ORDER.filter(p => byPhase[p]?.length).map(p => ({ name: p, avg: mean(byPhase[p]), n: byPhase[p].length })),
    move: { avg: mean(withMove), n: withMove.length },
    still: { avg: mean(without), n: without.length },
  };
}

// ── как профиль влияет на день ──────────────────────────────────
/** Норма квестов в день: ползунок «Активность» превращается в ожидание. */
export function dayLoad() {
  const a = Number(S.user.activity);
  const norm = a > 75 ? 5 : a > 60 ? 4 : a > 40 ? 3 : 2;
  return { norm, high: a > 60 };
}

/** Какой отдых предлагать — из ползунка «Интроверсия». */
export const restKind = () => (effects().rest === 'people' ? 'people' : 'quiet');
export const restLine = () => (restKind() === 'people'
  ? 'Отдых сегодня — это увидеться с кем-то, а не лечь пораньше.'
  : 'Отдых сегодня — это тишина и никого, даже если зовут.');

/** Голос Летописца: черта задаёт тон, а не содержание. */
export function tone() {
  const t = effects().tone;
  if (t === 'brief') return { hi: 'Коротко:', warm: false };
  if (t === 'meaning') return { hi: 'Зачем это сегодня:', warm: false };
  if (t === 'spark') return { hi: 'Попробуем иначе:', warm: false };
  return { hi: '', warm: true };
}

// ── потребности и роли ──────────────────────────────────────────
const lastDays = n => Array.from({ length: n }, (_, i) => addDays(todayISO(), -i));
const sum = parts => parts.reduce((a, x) => a + x.n, 0);

function habitRate(nameMatch, days) {
  const hs = liveHabits().filter(hb => nameMatch.test(hb.name));
  if (!hs.length) return null;
  const hits = days.filter(d => hs.some(hb => habitDone(hb, d))).length;
  return Math.round((hits / days.length) * 100);
}

function questRate(sphereKeys, days, per) {
  const n = days.reduce((acc, d) => acc + questsOn(d).filter(q => q.done && sphereKeys.includes(q.sphere)).length, 0);
  return Math.min(100, Math.round((n / per) * 100));
}

/** Сколько закрытых квестов по этим сферам за окно дней. */
const questsDone = (keys, days) =>
  days.reduce((acc, d) => acc + questsOn(d).filter(q => q.done && keys.includes(q.sphere)).length, 0);

/**
 * Спортивная активность по составляющим. Одно место на всё приложение:
 * и «Движение» в потребностях, и роль «Атлет» считают отсюда, поэтому не
 * могут разойтись — раньше роль видела только квесты и молчала о тренировках.
 */
export function sportParts(days) {
  return [
    { label: 'квесты', n: questsDone(['sport'], days) },
    // Тренировка, привязанная к занятию, уже посчитана занятием — не удваиваем.
    { label: 'тренировки', n: workoutsIn(days).filter(w => !w.lessonId).length },
    { label: 'занятия', n: sportLessonSessions(days) },
  ];
}

/** Движение — это и спорт-квесты, и тренировки, и занятия «считать в спорте». */
function moveRate(days) {
  const n = sum(sportParts(days));
  if (!n) return habitRate(/растяж|зал|бег|йог/i, days);
  return Math.min(100, Math.round((n / 3) * 100));
}

/** Потребности за последние 7 дней: 0..100. null — данных пока нет. */
export function needs() {
  const days = lastDays(7);
  const sleepH = S.health.measures.filter(m => m.sleep != null).slice(-3);
  const sleepAvg = sleepH.length ? sleepH.reduce((a, m) => a + m.sleep, 0) / sleepH.length : null;
  const sleepFromHabit = habitRate(/сон|спать/i, days);
  const sleep = sleepAvg != null ? Math.min(100, Math.round((sleepAvg / S.user.sleep) * 100))
                                 : sleepFromHabit;
  return [
    { key: 'sleep', name: 'Сон', value: sleep, hint: 'отметь сон в «Теле» или заведи привычку' },
    { key: 'move', name: 'Движение', value: moveRate(days), hint: 'спорт-квесты и занятия за неделю' },
    { key: 'food', name: 'Еда', value: questRate(['food'], days, 3) || habitRate(/вод|еда|завтрак|белок/i, days), hint: 'питание за неделю' },
    { key: 'create', name: 'Творчество', value: questRate(['blog', 'edu', 'study'], days, 4), hint: 'блог, обучение и учёба за неделю' },
  ];
}

/**
 * Роли и то, чем они живут. Считается всё, что реально отмечено, а не одни
 * квесты: тренировка на «Дне», занятие с полки, пара по предмету, операция
 * в бюджете, дочитанная книга — каждая отметка кормит свою роль.
 *
 * Считаются только события с датой. Этап сферы без отметки времени в окно не
 * попадёт — лучше не показать, чем показать выдуманное.
 */
const ROLES = [
  {
    name: 'Учёная', keys: ['edu', 'study', 'books'],
    parts: days => [
      { label: 'квесты', n: questsDone(['edu', 'study', 'books'], days) },
      { label: 'занятия', n: liveLessons().reduce((a, l) => a + lessonDates(l).filter(d => days.includes(d)).length, 0) },
      { label: 'пары', n: Object.values(S.study.attend || {})
        .reduce((a, byDate) => a + Object.keys(byDate || {}).filter(d => byDate[d] && days.includes(d)).length, 0) },
      { label: 'книги', n: booksBy('done').filter(b => days.includes(b.finished)).length },
    ],
  },
  { name: 'Атлет', keys: ['sport'], parts: sportParts },
  {
    name: 'Артистка', keys: ['blog'],
    parts: days => [
      { label: 'квесты', n: questsDone(['blog'], days) },
      { label: 'посты', n: sphereItems('blog').filter(i => i.done && days.includes((i.doneAt || '').slice(0, 10))).length },
    ],
  },
  {
    name: 'Хранительница', keys: ['money', 'food'],
    parts: days => [
      { label: 'квесты', n: questsDone(['money', 'food'], days) },
      { label: 'операции', n: (S.budget.ops || []).filter(o => days.includes(o.date)).length },
      { label: 'дни питания', n: days.filter(d => (S.food.days[d]?.entries || []).length).length },
    ],
  },
];

/** Роль «скучает», если по её делам две недели нет ни одной отметки. */
export function roles(window = 14) {
  const days = lastDays(window);
  return ROLES.map(r => {
    const parts = r.parts(days).filter(p => p.n > 0);
    const n = sum(parts);
    const state = n === 0 ? 'скучает' : n < 3 ? 'ровно' : 'довольна';
    return { name: r.name, keys: r.keys, parts, n, state, low: n === 0, window };
  });
}

/** Жемчужина дня — последнее заметное событие, а не выдуманная строка. */
export function pearl() {
  const t = todayISO();
  const doneToday = questsOn(t).filter(q => q.done);
  const boss = doneToday.find(q => q.boss);
  if (boss) return `Босс повержен: ${boss.title} ✦`;
  if (doneToday.length) return doneToday[doneToday.length - 1].title;
  const fresh = S.diary[0];
  if (fresh && fresh.date === t) return fresh.text;
  const week = weekStats(t);
  if (week.done) return `На этой неделе закрыто ${week.done} из ${week.total}`;
  return 'День только начинается';
}

/** Летописец без сети: правила поверх реальных данных. */
export function chronicler(date) {
  const qs = questsOn(date);
  const e = S.energy[date];
  const t = todayISO();
  const out = [];

  if (e != null && e <= 30 && qs.some(q => !q.done)) {
    out.push(`Энергия ${e} из 100. Оставь на сегодня одно главное, остальное перенесу без вопросов.`);
  } else if (e != null && e >= 80) {
    out.push(`Энергия ${e} — план по силам. Пик у тебя в ${peakLabel()}, тяжёлое ставь туда.`);
  }

  const cyc = cycleInfo();
  if (cyc && cyc.day) {
    if (cyc.bleeding) out.push('Идут месячные. Тяжёлое можно отложить — перенос сегодня совершенно нормален.');
    else if (cyc.phase === 'перед циклом') out.push(`До следующего цикла ${cyc.daysToNext >= 0 ? cyc.daysToNext : 0} дн. Планирую мягче — не удивляйся.`);
    else if (cyc.phase === 'овуляция') out.push('Овуляция — обычно это самые сильные дни. Хороший момент для сложного.');
  }

  const stu = studyNow(7);
  if (stu.overdue.length) {
    const first = stu.overdue[0];
    out.push(`«${first.title}» просрочено на ${-diffDays(first.due, t)} дн. Срок уже прошёл — либо доделать, либо перенести честно.`);
  } else if (stu.due.length) {
    const first = stu.due[0];
    out.push(`До «${first.title}» ${diffDays(first.due, t)} дн., а этап пока ${stageOf(first.stage).short}.`);
  }
  const longWait = stu.waiting.find(x => (waitingDays(x) || 0) >= 7);
  if (longWait) out.push(`«${longWait.title}» у преподавателя ${waitingDays(longWait)} дн. Может, напомнить о себе?`);

  const forgotten = practices().filter(l => !l.paused && l.perMonth).map(l => ({ l, ago: lessonAgo(l) }))
    .filter(x => x.ago == null || x.ago >= 14)
    .sort((a, b) => (b.ago ?? 999) - (a.ago ?? 999))[0];
  if (forgotten) {
    out.push(forgotten.ago == null
      ? `«${forgotten.l.name}» ещё ни разу не отмечено. Поставим первое занятие?`
      : `«${forgotten.l.name}» не было ${forgotten.ago} дней. Вернём на этой неделе?`);
  }

  const lowRole = roles().find(r => r.low);
  if (lowRole) out.push(`${lowRole.name} две недели без дела. Вернём что-нибудь маленькое на этой неделе?`);

  const undoneYesterday = questsOn(addDays(date, -1)).filter(q => !q.done).length;
  if (undoneYesterday >= 3) out.push(`Вчера осталось ${undoneYesterday} задач. Это не долг — просто перенесём.`);

  const wk = weekOf(date);
  if (wk && wk.rest) out.push('Это неделя отдыха. Треки роста я приглушила — так и задумано.');
  else if (wk && wk.boss) {
    const steps = wk.boss.steps || [];
    const left = steps.filter(s => !s.done).length;
    if (steps.length && !left) out.push(`Босс «${wk.boss.title}» повержен ✦ Предлагаю неделю отдыха.`);
    else if (steps.length) out.push(`Босс недели: «${wk.boss.title}», осталось этапов — ${left}.`);
  }

  const load = dayLoad();
  const open = qs.filter(q => !q.done).length;
  if (open > load.norm + 2) {
    out.push(load.high
      ? `На день ${open} дел — даже для твоего темпа много. Что-то одно можно отпустить.`
      : `На день ${open} дел, а твой ровный темп — около ${load.norm}. Перенесу лишнее без вопросов.`);
  }

  if (e != null && e <= 30) out.push(restLine());

  if (effects().suggest === 'new') {
    const seen = S.ui.newIdeaMonth;
    const m = date.slice(0, 7);
    if (seen !== m && date === t) out.push('Месяц новый — попробуем что-то незнакомое? Одно занятие или одну идею в блог.');
  }

  if (!qs.length) out.push(date === t ? 'На сегодня пусто. Добавим одно дело — этого достаточно.' : `На ${dayShort(date)} пока пусто.`);
  if (!out.length) out.push(`Всё идёт ровно. Пик энергии сегодня в ${peakLabel()}.`);
  return out;
}

// ── забота: повторяющиеся дела ──────────────────────────────────
export const CARE_GROUPS = [
  { key: 'health', name: 'Здоровье' },
  { key: 'beauty', name: 'Красота' },
  { key: 'home',   name: 'Дом и документы' },
  { key: 'pet',    name: 'Питомец' },
];
export const careGroupName = key => (CARE_GROUPS.find(g => g.key === key) || {}).name || 'Забота';

/** Замеры тела не дублируются: «последний раз» берётся из раздела «Тело». */
export function careLast(it) {
  if (it.link === 'measure') {
    const dates = (S.health.measures || []).map(m => m.date).filter(Boolean).sort();
    return dates.length ? dates[dates.length - 1] : '';
  }
  return it.last || '';
}

/**
 * Когда пора. Если дело уже отмечали — считаем от последней отметки.
 * Если нет — берём ближайший месяц из плана: точный день не выдумываем.
 */
export function careNext(it, from = todayISO()) {
  const last = careLast(it);
  const every = Math.max(1, Number(it.every) || 1);
  if (last) {
    // 31 января плюс месяц — это 28 февраля, а не «31 февраля».
    const ym = addMonths(last.slice(0, 7), every);
    const day = Math.min(Number(last.slice(8, 10)), daysInMonth(ym));
    return { date: `${ym}-${String(day).padStart(2, '0')}`, exact: true };
  }
  const anchor = Number(it.anchor) || 0;
  if (!anchor) return { date: from, exact: false, never: true };
  // Ближайший месяц, который попадает в ритм: от якоря шагами по every.
  let ym = from.slice(0, 4) + '-' + String(anchor).padStart(2, '0');
  while ((Number(ym.slice(5, 7)) - anchor) % every !== 0) ym = addMonths(ym, 1);
  while (ym < monthKey(from)) ym = addMonths(ym, every);
  return { date: ym + '-01', exact: false, month: ym };
}

/** Сколько дней осталось: минус — просрочено. */
export const careDue = (it, from = todayISO()) => diffDays(careNext(it, from).date, from);

export const careItems = () => S.care.items;
export const careSorted = (list = careItems()) => [...list].sort((a, b) => careDue(a) - careDue(b));
export const careDueNow = () => careSorted().filter(it => careDue(it) <= 0);
export const careSoon = (days = 30) => careSorted().filter(it => careDue(it) > 0 && careDue(it) <= days);
export const careInGroup = key => careSorted(careItems().filter(it => it.group === key));

/** Во сколько обойдётся месяц: считаем только дела с проставленной ценой. */
export const careMonthCost = (ym = monthKey(todayISO())) =>
  careItems().reduce((a, it) => a + (careNext(it).date.slice(0, 7) === ym ? Number(it.cost) || 0 : 0), 0);

/** План на год: что в каком месяце, если ритм не сбивать. */
export function careYearPlan(year = todayISO().slice(0, 4)) {
  const y = String(year);            // yearOf возвращает число — сравнения строк ломались
  const out = {};
  careItems().forEach(it => {
    const every = Math.max(1, Number(it.every) || 1);
    let cur = careNext(it, `${y}-01-01`);
    for (let i = 0; i < 12 && cur.date.slice(0, 4) <= y; i++) {
      const ym = cur.date.slice(0, 7);
      if (ym.slice(0, 4) === y) (out[ym] ||= []).push(it);
      cur = { date: addMonths(cur.date.slice(0, 7), every) + '-01' };
    }
  });
  return out;
}

/** Возраст питомца словами — из даты рождения. */
export function petAge(birth, from = todayISO()) {
  if (!birth) return '';
  const months = (Number(from.slice(0, 4)) - Number(birth.slice(0, 4))) * 12
    + (Number(from.slice(5, 7)) - Number(birth.slice(5, 7)))
    - (Number(from.slice(8, 10)) < Number(birth.slice(8, 10)) ? 1 : 0);
  if (months < 0) return '';
  const y = Math.floor(months / 12), m = months % 12;
  const yy = y ? `${y} ${plural(y, 'год', 'года', 'лет')}` : '';
  const mm = m ? `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')}` : '';
  return [yy, mm].filter(Boolean).join(' ') || 'меньше месяца';
}

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

// ── расписание ──────────────────────────────────────────────────
// Событие не хранится по датам: хранится правило, а день считается из него.
// Поэтому расписание можно поменять задним числом — прошлое не поедет.
export const schedules = () => S.schedules || [];
export const schedulesOf = (kind, refId) => schedules().filter(sc => sc.kind === kind && sc.refId === refId);

/** Попадает ли правило на эту дату: день недели, срок и чётность недели. */
export function scheduleHits(sc, date) {
  if (sc.off) return false;
  if (!sc.days?.length) return false;
  if (!sc.days.includes(dowIndex(date))) return false;
  if (sc.from && date < sc.from) return false;
  if (sc.to && date > sc.to) return false;
  if (Number(sc.every) === 2) {
    const anchor = sc.from || date;
    const weeks = Math.round(diffDays(startOfWeek(date), startOfWeek(anchor)) / 7);
    if (weeks % 2 !== 0) return false;
  }
  return true;
}

/** Как называется то, к чему привязано правило. */
export function scheduleTitle(sc) {
  if (sc.kind === 'lesson') return (S.lessons.find(l => l.id === sc.refId) || {}).name || 'Занятие';
  if (sc.kind === 'subject') return (S.study.subjects.find(x => x.id === sc.refId) || {}).name || 'Предмет';
  if (sc.kind === 'template') return templateName(sc.refId) || 'Тренировка';
  return sc.title || 'Событие';
}

/** Отмечено ли уже: у каждого вида своя честная запись, отдельной галочки нет. */
export function scheduleDone(sc, date) {
  if (sc.kind === 'lesson') return !!(S.lessons.find(l => l.id === sc.refId) || {}).log?.[date];
  if (sc.kind === 'subject') return !!S.study.attend?.[sc.refId]?.[date];
  if (sc.kind === 'template') return S.sport.workouts.some(w => w.date === date && w.templateId === sc.refId);
  return false;
}

/**
 * Одно занятие можно перенести или отменить, не трогая правило: перенос
 * хранится как «дата по правилу → новая дата», пустая строка — отмена.
 */
export const scheduleMovedTo = (sc, date) => (sc.moves || {})[date];
export const scheduleMovedFrom = (sc, date) =>
  Object.keys(sc.moves || {}).find(from => sc.moves[from] === date) || '';

/** Бывает ли занятие в этот день с учётом переносов. */
export function scheduleOccursOn(sc, date) {
  if (sc.off) return false;
  if (scheduleMovedFrom(sc, date)) return true;
  if (!scheduleHits(sc, date)) return false;
  // Пустая строка — отменённое занятие, непустая — уехало в другой день.
  return scheduleMovedTo(sc, date) === undefined;
}

/** События дня, отсортированные по времени. Тренировка, уже заведённая
 *  на день, из расписания пропадает — её показывает свой же блок. */
export const scheduleOn = date => schedules()
  .filter(sc => scheduleOccursOn(sc, date))
  .filter(sc => !(sc.kind === 'template' && scheduleDone(sc, date)))
  .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

/**
 * Занятия, которые в этот день были по правилу, но уехали или отменены.
 * Показываем их же на своём дне, иначе отмену будет некуда вернуть.
 */
export const scheduleShiftedOn = date => schedules()
  .filter(sc => !sc.off && scheduleHits(sc, date) && scheduleMovedTo(sc, date) !== undefined)
  .map(sc => ({ sc, to: scheduleMovedTo(sc, date) }));

/** «пн, чт · 19:30 · 1 ч» — как правило читается одной строкой. */
export function scheduleLabel(sc) {
  const days = (sc.days || []).slice().sort((a, b) => a - b).map(d => DOW[d].toLowerCase()).join(', ');
  const parts = [days];
  if (Number(sc.every) === 2) parts.push('раз в две недели');
  if (sc.time) parts.push(sc.time);
  if (sc.dur) parts.push(sc.dur >= 60 ? `${Math.round(sc.dur / 60 * 10) / 10} ч` : `${sc.dur} мин`);
  return parts.filter(Boolean).join(' · ');
}

/** Сколько занятий по расписанию выпадает на месяц — для плана и трекера. */
export function scheduleMonthCount(sc, ym) {
  return monthDates(ym).filter(d => scheduleOccursOn(sc, d)).length;
}

// ── беседа с Летописцем ─────────────────────────────────────────
/**
 * Выжимка данных для разговора: коротко и по делу. Отправляется наружу,
 * поэтому здесь ровно то, что перечислено в интерфейсе, — без дневника,
 * цикла и КБЖУ.
 */
export function chatDigest() {
  const t = todayISO();
  const qs = questsOn(t);
  const w = weekStats(t);
  const e7 = energyRecent(7).filter(x => x.value != null);
  const goals = liveGoals().filter(g => ['month', 'year'].includes(g.horizon)).slice(0, 6);
  const hb = liveHabits().slice(0, 6);
  const late = (S.care?.items || []).filter(it => careDue(it) < 0).slice(0, 6);
  const lines = [
    `Сегодня ${t}, ${dayShort(t)}.`,
    `Хронотип ${S.user.chronotype}, пик энергии ${peakLabel()}. Уровень ${level(S.user.xp)}.`,
    S.user.traits?.length ? `Черты: ${S.user.traits.map(id => (traitById(id) || {}).name || id).join(', ')}.` : '',
    `Энергия сегодня: ${S.energy[t] ?? 'не отмечена'}${e7.length ? `, в среднем за неделю ${Math.round(e7.reduce((a, x) => a + x.value, 0) / e7.length)}` : ''}.`,
    `Квесты сегодня: ${qs.length ? qs.map(x => `${x.title}${x.done ? ' (сделано)' : ''}`).join(', ') : 'нет'}.`,
    `За неделю закрыто ${w.done} из ${w.total}.`,
    goals.length ? `Цели: ${goals.map(g => `${g.title} — ${goalProgress(g)}%${g.struck ? ', вычеркнута' : ''}`).join('; ')}.` : 'Целей на месяц и год пока нет.',
    hb.length ? `Привычки за неделю: ${hb.map(x => `${x.name} ${habitWeekDone(x, t)}/7`).join(', ')}.` : '',
    `Потребности: ${needs().filter(n => n.value != null).map(n => `${n.name} ${n.value}%`).join(', ') || 'нет данных'}.`,
    roles().filter(r => r.low).length ? `Роли без дела: ${roles().filter(r => r.low).map(r => r.name).join(', ')}.` : '',
    late.length ? `Просрочено в заботе: ${late.map(it => it.name).join(', ')}.` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

/** Последние записи дневника — только если пользовательница сама разрешила. */
export const diaryDigest = (n = 5) => (S.diary || [])
  .slice(-n)
  .map(d => `${dayShort(d.date)}: ${String(d.text || '').slice(0, 300)}`)
  .join('\n');

// ── библиотека ──────────────────────────────────────────────────
export const BOOK_STATUS = [
  { key: 'reading', name: 'Читаю' },
  { key: 'want', name: 'Хочу прочитать' },
  { key: 'done', name: 'Прочитано' },
  { key: 'dropped', name: 'Отложено' },
];
export const books = () => S.library.books;
export const booksBy = status => books().filter(b => b.status === status);
export const bookById = id => books().find(b => b.id === id);

/** Процент прочитанного — только если известно, сколько всего страниц. */
export const bookProgress = b => (b.pages > 0 ? Math.min(100, Math.round((b.page / b.pages) * 100)) : null);

/** Дочитанные за месяц и за год — по дате, когда книга закрыта. */
export const booksDoneIn = ym => booksBy('done').filter(b => (b.finished || '').slice(0, 7) === ym);
export const booksDoneYear = year => booksBy('done').filter(b => (b.finished || '').slice(0, 4) === String(year));

/** Сколько страниц прочитано за год — считаем только там, где объём известен. */
export const pagesInYear = year => booksDoneYear(year).reduce((a, b) => a + (Number(b.pages) || 0), 0);

/** Средняя оценка за год: книги без оценки в среднее не идут. */
export function ratingAvg(year) {
  const rated = booksDoneYear(year).filter(b => b.rating > 0);
  if (!rated.length) return null;
  return Math.round((rated.reduce((a, b) => a + b.rating, 0) / rated.length) * 10) / 10;
}

// ── страны ──────────────────────────────────────────────────────
export const visits = () => S.travel.visits;

/** Уникальные страны за всю жизнь, отсортированные по названию. */
export function countriesEver() {
  const map = new Map();
  visits().forEach(v => {
    const c = countryBy(v.code);
    if (!c) return;
    const cur = map.get(v.code) || { ...c, years: [] };
    if (!cur.years.includes(v.year)) cur.years.push(v.year);
    map.set(v.code, cur);
  });
  return [...map.values()]
    .map(c => ({ ...c, years: c.years.sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export const countriesInYear = year => countriesEver().filter(c => c.years.includes(Number(year)));

/** Сколько регионов задето: «была на четырёх континентах» честнее процента. */
export const regionsEver = () => REGIONS.filter(r => countriesEver().some(c => c.region === r));

/** Годы, в которые вообще были поездки, — от свежих к старым. */
export const travelYears = () => [...new Set(visits().map(v => v.year))].sort((a, b) => b - a);

export const COUNTRY_TOTAL = COUNTRIES.length;

// ── форма: тело, еда и спорт на одном отрезке ───────────────────
// Три раздела ведутся по отдельности, но вопрос у них общий: что вообще
// происходит. Здесь они просто кладутся рядом за один период — без выводов
// о причинах: приложение не знает, отчего изменился вес, и врать не будет.

/** Суммы КБЖУ за день — та же логика, что на экране питания. */
export const foodSums = date => ((S.food.days[date] || {}).entries || []).reduce(
  (a, e) => ({ kcal: a.kcal + (e.kcal || 0), prot: a.prot + (e.prot || 0), fat: a.fat + (e.fat || 0), carb: a.carb + (e.carb || 0) }),
  { kcal: 0, prot: 0, fat: 0, carb: 0 },
);

/** Дни периода, в которые вообще что-то записано в еде. */
const filledFoodDays = days => days.filter(d => foodSums(d).kcal > 0);

export function formSummary(days = 30) {
  const from = addDays(todayISO(), -(days - 1));
  const range = Array.from({ length: days }, (_, i) => addDays(from, i));

  // Тело: первый и последний замеры внутри периода.
  const inRange = [...S.health.measures].filter(m => m.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  const first = inRange[0], last = inRange[inRange.length - 1];
  const delta = f => (first && last && first !== last && first[f] != null && last[f] != null
    ? +(last[f] - first[f]).toFixed(1) : null);

  // Еда: среднее только по заполненным дням, и честно сколько их было.
  const filled = filledFoodDays(range);
  const avg = f => (filled.length
    ? Math.round(filled.reduce((a, d) => a + foodSums(d)[f], 0) / filled.length) : null);

  // Спорт: отмеченные тренировки периода и по каким пилюлям.
  const done = S.sport.workouts.filter(w => w.done && !w.measure && w.date >= from);
  const byTag = {};
  done.forEach(w => (w.tags || []).forEach(id => { byTag[id] = (byTag[id] || 0) + 1; }));
  const tags = Object.entries(byTag)
    .map(([id, n]) => ({ name: tagName(id), n }))
    .filter(x => x.name)
    .sort((a, b) => b.n - a.n);

  const waterAvg = filled.length
    ? Math.round(range.reduce((a, d) => a + ((S.food.days[d] || {}).water || 0), 0) / filled.length) : null;

  return {
    days, from,
    body: { first, last, count: inRange.length, weight: delta('weight'), waist: delta('waist'), hips: delta('hips') },
    food: { filled: filled.length, kcal: avg('kcal'), prot: avg('prot'), fat: avg('fat'), carb: avg('carb'), water: waterAvg },
    sport: { count: done.length, perWeek: Math.round((done.length / days) * 7 * 10) / 10, tags },
  };
}

/** Норма белка от последнего веса: ориентир, а не предписание. */
export function proteinHint() {
  const cur = measureDeltas().cur;
  const kg = cur && cur.weight != null ? Number(cur.weight) : null;
  if (!kg) return null;
  return { kg, low: Math.round(kg * 1.2), high: Math.round(kg * 1.6), date: cur.date };
}
