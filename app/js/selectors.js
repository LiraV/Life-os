// Производные значения. Ничего не хранят — считают из состояния,
// чтобы прогресс, потребности и реплики Летописца шли из реальных данных.

import { S, SPHERES, allSpheres, level, levelFloor, isWater } from './store.js';
import { effects, hasTrait, byId as traitById, nameOf } from './traits.js';
import { COUNTRIES, countryBy, REGIONS } from './countries.js';
import { isMale } from './gender.js';
import { todayISO, addDays, weekDates, weekKey, monthDates, diffDays, dayShort, quarterMonths, addMonths, monthKey, daysInMonth, dowIndex, DOW, startOfWeek } from './dates.js';

export const questsOn = date => S.quests[date] || [];

// ── инбокс ──────────────────────────────────────────────────────
/** Входящее, новое сверху: инбокс читают с конца, а не с начала. */
export const inboxItems = () => [...(S.inbox || [])].reverse();
export const inboxCount = () => (S.inbox || []).length;
/** Сколько дней лежит. Не для укора — чтобы было видно, что пора решить. */
export const inboxAge = it => diffDays(todayISO(), it.createdAt);
// По всем сферам, а не только встроенным: иначе своя сфера открывалась бы
// экраном «такой сферы нет».
export const sphereOf = key => allSpheres().find(s => s.key === key);

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
export const counterOf = g => {
  // У цели с источником набранное не хранится, а считается: вписывать его
  // руками было бы вторым числом про то же самое.
  const auto = autoCount(g);
  return {
    current: auto != null ? auto : Number(g.current) || 0,
    target: Number(g.target) || 0,
    unit: g.unit || '',
    auto: auto != null,
  };
};

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
/** Журнал сферы: { дата: число }. Механика «отметки по дням» у своих сфер. */
export const sphereLog = key => (S.spheres[key] || {}).log || {};
export const sphereLogOn = (key, date) => Math.max(0, Number(sphereLog(key)[date]) || 0);
export const sphereLogMonth = (key, ym) => monthDates(ym).filter(d => sphereLogOn(key, d) > 0).length;
export const sphereLogTotal = (key, ym) => monthDates(ym).reduce((a, d) => a + sphereLogOn(key, d), 0);
export const sphereLogYear = (key, y) => Object.keys(sphereLog(key))
  .filter(d => d.startsWith(String(y)) && sphereLogOn(key, d) > 0).length;

// ── остальные механики своей сферы ──────────────────────────────
// У каждой свой ящик в записи сферы, поэтому они не мешают друг другу:
// можно вести и полку, и журнал, и ничего не разъедется.
const box = (key, name) => (S.spheres[key] || {})[name] || [];

/** Полка: путь «хочу → делаю → сделано», плюс «отложено» — это не провал. */
export const SHELF_STATUS = [
  { key: 'want', name: 'Хочу' },
  { key: 'doing', name: 'В процессе' },
  { key: 'done', name: 'Сделано' },
  { key: 'off', name: 'Отложено' },
];
export const sphereShelf = key => box(key, 'shelf');
export const shelfBy = (key, status) => sphereShelf(key).filter(x => x.status === status);
export const shelfDoneIn = (key, from, to) => shelfBy(key, 'done')
  .filter(x => x.finished && x.finished >= from && x.finished <= to);

/** Коллекция: единицы с датой. «За жизнь» — все, «за год» — по дате. */
export const sphereColl = key => box(key, 'coll');
export const collIn = (key, from, to) => sphereColl(key).filter(x => x.date && x.date >= from && x.date <= to);
export const collYear = (key, y) => sphereColl(key).filter(x => (x.date || '').startsWith(String(y)));

/** Доска: те же стадии, что в учёбе, но короче — не начато, в работе, готово. */
export const BOARD_STAGES = [
  { key: 'todo', name: 'Не начато' },
  { key: 'doing', name: 'В работе' },
  { key: 'done', name: 'Готово' },
];
export const sphereBoard = key => box(key, 'board');
export const boardBy = (key, stage) => sphereBoard(key).filter(x => (x.stage || 'todo') === stage);
export const boardDoneIn = (key, from, to) => boardBy(key, 'done')
  .filter(x => x.stageAt && x.stageAt >= from && x.stageAt <= to);

/** Замеры: число с датой. Рекорд считаем только если сказано, куда лучше. */
export const sphereMeas = key => [...box(key, 'meas')].sort((a, b) => (a.date < b.date ? -1 : 1));
export const measIn = (key, from, to) => sphereMeas(key).filter(x => x.date >= from && x.date <= to);
export const measLast = key => sphereMeas(key).slice(-1)[0] || null;
export function measRecord(key) {
  const sp = (S.customSpheres || []).find(x => x.key === key);
  const list = sphereMeas(key);
  if (!list.length || !sp || sp.dir === 'none') return null;
  const better = (a, b) => (sp.dir === 'down' ? a.value < b.value : a.value > b.value);
  return list.reduce((best, x) => (better(x, best) ? x : best), list[0]);
}

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
// Привычка со связью 'water' не хранит своих чисел: и норма, и выпитое
// берутся из «Питания». Поэтому один стакан виден сразу в обоих местах —
// синхронизировать нечего, число одно.
export const habitTarget = hb => (isWater(hb)
  ? Math.max(1, Number(S.food.targets.water) || 1)
  : Math.max(1, Number(hb.target) || 1));
export const habitCount = (hb, date) => (isWater(hb)
  ? Math.max(0, Number(S.food.days[date]?.water) || 0)
  : Math.max(0, Number(hb.log?.[date]) || 0));
export const habitDone = (hb, date) => habitCount(hb, date) >= habitTarget(hb);

/** Дни, в которые у привычки есть значение, — с учётом связи. Для выгрузки. */
export const habitDates = hb => (isWater(hb)
  ? Object.keys(S.food.days).filter(d => Number(S.food.days[d]?.water) > 0)
  : Object.keys(hb.log || {}).filter(d => Number(hb.log[d]) > 0)).sort();

/** Единица измерения: у воды она своя и задана «Питанием». */
export const habitUnit = hb => (isWater(hb) ? 'мл' : hb.unit || '');

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
/**
 * Что оставляет след в каждой сфере. Роль потом просто складывает следы своих
 * сфер — поэтому новая сфера попадает в круг ролей сама, без правки ролей.
 */
export function sphereParts(key, days) {
  const quests = { label: 'квесты', n: questsDone([key], days) };
  if (key === 'sport') return [...sportParts(days).slice(1), quests];
  if (key === 'edu') return [quests,
    { label: 'занятия', n: liveLessons().reduce((a, l) => a + lessonDates(l).filter(d => days.includes(d)).length, 0) }];
  if (key === 'study') return [quests,
    { label: 'пары', n: Object.values(S.study.attend || {})
      .reduce((a, byDate) => a + Object.keys(byDate || {}).filter(d => byDate[d] && days.includes(d)).length, 0) }];
  if (key === 'books') return [quests,
    { label: 'книги', n: booksBy('done').filter(b => days.includes(b.finished)).length }];
  if (key === 'money') return [quests,
    { label: 'операции', n: (S.budget.ops || []).filter(o => days.includes(o.date)).length }];
  if (key === 'work') return [quests,
    { label: 'рабочие дни', n: days.filter(d => dayEntries(d).some(e => e.type === 'work')).length },
    { label: 'задачи', n: workDoneIn(days[days.length - 1], days[0]).length },
    { label: 'опыт', n: winsIn(days[days.length - 1], days[0]).length }];
  if (key === 'food') return [quests,
    { label: 'дни питания', n: days.filter(d => (S.food.days[d]?.entries || []).length).length }];
  // «Страны» отмечаются годом, а не датой, поэтому в двухнедельное окно им
  // попасть нечем: считаем только квесты, а не выдумываем поездке день.
  // Своя сфера приносит закрытые этапы с датой и отметки журнала.
  // У блога закрытый этап — это опубликованный пост, так его и называем.
  const inDays = d => days.includes((d || '').slice(0, 10));
  return [quests,
    { label: key === 'blog' ? 'посты' : 'этапы',
      n: sphereItems(key).filter(i => i.done && inDays(i.doneAt)).length },
    { label: 'отметки', n: days.filter(d => Number(sphereLog(key)[d]) > 0).length },
    { label: 'закрыто', n: shelfBy(key, 'done').filter(x => inDays(x.finished)).length },
    { label: 'собрано', n: sphereColl(key).filter(x => inDays(x.date)).length },
    { label: 'доведено', n: boardBy(key, 'done').filter(x => inDays(x.stageAt)).length },
    { label: 'замеры', n: sphereMeas(key).filter(x => inDays(x.date)).length }];
}

/**
 * Роли. Набор фиксирован — это характеры, а не пользовательские папки, — но
 * какая сфера к какой роли относится, лежит в состоянии и правится руками.
 * Поэтому своя сфера встаёт в круг наравне со встроенными.
 *
 * Считаются только события с датой: без неё событие в окно не попадёт, а
 * выдумывать ему день нельзя.
 */
export const ROLES = [
  { id: 'scholar', name: 'Учёная' },
  { id: 'reader', name: 'Читательница' },
  { id: 'athlete', name: 'Атлет' },
  { id: 'healer', name: 'Целительница' },
  { id: 'artist', name: 'Артистка' },
  { id: 'master', name: 'Мастерица' },
  { id: 'keeper', name: 'Хранительница' },
  { id: 'wanderer', name: 'Странница' },
];

export const roleById = id => ROLES.find(r => r.id === id);
/** Сферы этой роли — по карте привязок, а не по списку в коде. */
export const spheresOfRole = id => allSpheres().filter(sp => S.roleOf[sp.key] === id);
export const roleOfSphere = key => S.roleOf[key] || '';

/** Роль «скучает», если по её сферам две недели нет ни одной отметки. */
export function roles(window = 14) {
  const days = lastDays(window);
  return ROLES.map(r => {
    const keys = spheresOfRole(r.id).map(sp => sp.key);
    const merged = {};
    keys.forEach(k => sphereParts(k, days).forEach(pt => { merged[pt.label] = (merged[pt.label] || 0) + pt.n; }));
    const parts = Object.entries(merged).map(([label, n]) => ({ label, n })).filter(p => p.n > 0);
    const n = sum(parts);
    const state = n === 0 ? 'скучает' : n < 3 ? 'ровно' : 'довольна';
    // Имя роли берётся в роде профиля на каждом расчёте, а не при загрузке:
    // иначе смена пола в настройках не долетала бы до круга без перезапуска.
    return { id: r.id, name: nameOf(r.name), keys, parts, n, state, low: n === 0, window };
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
    `Пол: ${isMale() ? 'мужской' : 'женский'} — обращайся в этом роде.`,
    `Хронотип ${S.user.chronotype}, пик энергии ${peakLabel()}. Уровень ${level(S.user.xp)}.`,
    S.user.traits?.length ? `Черты: ${S.user.traits.map(id => nameOf(traitById(id)) || id).join(', ')}.` : '',
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

// ── сложение: рост, вес, пол и возраст ──────────────────────────
// Всё здесь — ориентиры, а не диагнозы: формулы дают оценку по среднему
// человеку и ничего не знают о конкретном теле. Поэтому каждая величина
// возвращает и число, и повод усомниться в нём.

/** Полных лет на сегодня. null — дата рождения не заполнена. */
export function age(from = todayISO()) {
  const b = S.user.birth;
  if (!b) return null;
  let y = Number(from.slice(0, 4)) - Number(b.slice(0, 4));
  if (from.slice(5) < b.slice(5)) y -= 1;
  return y >= 0 && y < 130 ? y : null;
}

/** Последний вес из замеров — общая точка входа для всех расчётов. */
const lastWeight = () => {
  const cur = measureDeltas().cur;
  return cur && cur.weight != null ? Number(cur.weight) : null;
};

/**
 * ИМТ. Границы одинаковы для мужчин и женщин — это не упущение, а сама
 * методика ВОЗ. Мышцы он не отличает от жира, о чём и говорит подпись.
 */
export function bmi() {
  const kg = lastWeight(), cm = Number(S.user.height) || 0;
  if (!kg || !cm) return null;
  const v = Math.round((kg / (cm / 100) ** 2) * 10) / 10;
  const band = v < 18.5 ? 'ниже нормы' : v < 25 ? 'норма' : v < 30 ? 'выше нормы' : 'заметно выше нормы';
  return { value: v, band, kg, cm };
}

/**
 * Тип сложения по обхвату запястья — индекс Соловьёва. Пороги свои у мужчин
 * и женщин. Это описание костяка, а не приговор и не программа тренировок:
 * ни норм веса, ни рекомендаций отсюда не выводится.
 */
export const BUILDS = {
  thin: { name: 'астеническое', note: 'тонкая кость' },
  norm: { name: 'нормостеническое', note: 'средняя кость' },
  wide: { name: 'гиперстеническое', note: 'широкая кость' },
};

export function build() {
  const w = Number(S.user.wrist) || 0;
  if (!w) return null;
  const [lo, hi] = isMale() ? [18, 20] : [15, 17];
  const key = w < lo ? 'thin' : w <= hi ? 'norm' : 'wide';
  return { key, wrist: w, ...BUILDS[key] };
}

/**
 * Расход калорий: Миффлин — Сан Жеор. Единственное место, где пол входит
 * в формулу напрямую: −161 у женщин, +5 у мужчин. Множитель активности
 * берётся из того же ползунка, что и норма квестов, — отдельной настройки
 * для него заводить незачем.
 */
export function energyNeed() {
  const kg = lastWeight(), cm = Number(S.user.height) || 0, yr = age();
  if (!kg || !cm || yr == null) return null;
  const bmr = Math.round(10 * kg + 6.25 * cm - 5 * yr + (isMale() ? 5 : -161));
  const a = Number(S.user.activity);
  const pal = a > 80 ? 1.725 : a > 60 ? 1.55 : a > 40 ? 1.375 : 1.2;
  return { bmr, pal, tdee: Math.round(bmr * pal), kg, cm, age: yr };
}

/**
 * Талия: пороги ВОЗ, у мужчин и женщин разные. Это скрининговый ориентир —
 * повод спросить врача, а не вывод о здоровье.
 */
export function waistRisk() {
  const cur = measureDeltas().cur;
  const cm = cur && cur.waist != null ? Number(cur.waist) : null;
  if (!cm) return null;
  const [warn, high] = isMale() ? [94, 102] : [80, 88];
  const level = cm >= high ? 'high' : cm >= warn ? 'warn' : 'ok';
  return { cm, warn, high, level, date: cur.date };
}


// ── бюджет: остаток копилки ─────────────────────────────────────
/** Стартовая сумма плюс все пополнения. Живёт здесь, а не в экране бюджета,
 *  потому что то же число нужно целям «накопить столько-то». */
export const vaultBalance = v =>
  (Number(v?.start) || 0) + (S.budget.ops || [])
    .filter(o => o.kind === 'save' && o.vaultId === v?.id)
    .reduce((a, o) => a + (Number(o.sum) || 0), 0);

// ── цели, которые считают себя сами ─────────────────────────────
// Обычная цель со счётчиком ждёт, что число впишут руками; такая берёт его
// из сферы: прочитанные книги, посещённые страны, отмеченные тренировки,
// занятия, остаток копилки.
//
// Автоматика тут только в счёте. Саму цель никто не заводит за человека:
// сфера предлагает, что она умеет считать, а взять это или нет — его выбор.

/** Отрезок дат периода цели. ISO-даты сравниваются как строки. */
export function periodRange(horizon, period) {
  if (horizon === 'month') return { from: `${period}-01`, to: `${period}-${String(daysInMonth(period)).padStart(2, '0')}` };
  if (horizon === 'quarter') {
    const ms = quarterMonths(period);
    return { from: `${ms[0]}-01`, to: `${ms[2]}-${String(daysInMonth(ms[2])).padStart(2, '0')}` };
  }
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

const inRange = (d, r) => !!d && d >= r.from && d <= r.to;
const doneWorkouts = r => S.sport.workouts.filter(w => w.done && !w.measure && inRange(w.date, r));

/**
 * Что сферы умеют считать. У источника есть единица, разрешённые горизонты
 * и — если нужно — выбор конкретной пилюли, занятия или копилки.
 */
/** Свои сферы, которые ведут эту механику, — списком для выбора в цели. */
const customWith = kind => (S.customSpheres || [])
  .filter(sp => !sp.archived && (sp.kinds || []).includes(kind))
  .map(sp => ({ value: sp.key, label: sp.name }));
const customName = key => (S.customSpheres || []).find(sp => sp.key === key)?.name || '';

export const SOURCES = {
  books: {
    sphere: 'books', name: 'Прочитано книг', unit: 'книг', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => booksBy('done').filter(b => inRange(b.finished, r)).length,
  },
  pages: {
    sphere: 'books', name: 'Прочитано страниц', unit: 'страниц', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => booksBy('done').filter(b => inRange(b.finished, r))
      .reduce((a, b) => a + (Number(b.pages) || 0), 0),
  },
  countriesYear: {
    // У поездки есть только год, поэтому месяц и квартал считать нечем:
    // такую цель просто не предлагаем, а не считаем криво.
    sphere: 'trips', name: 'Стран за год', unit: 'стран', horizons: ['year'],
    count: (_ref, _r, period) => countriesInYear(Number(period.slice(0, 4))).length,
  },
  countriesEver: {
    sphere: 'trips', name: 'Стран за жизнь', unit: 'стран', horizons: ['year'], lifetime: true,
    count: () => countriesEver().length,
  },
  workouts: {
    sphere: 'sport', name: 'Тренировок', unit: 'тренировок', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => doneWorkouts(r).length,
  },
  tag: {
    sphere: 'sport', name: 'Тренировок с пилюлей', unit: 'раз', horizons: ['year', 'quarter', 'month'],
    ref: () => sportTags().map(t => ({ value: t.id, label: t.name })),
    refName: id => tagById(id)?.name || '',
    count: (ref, r) => doneWorkouts(r).filter(w => (w.tags || []).includes(ref)).length,
  },
  lessons: {
    sphere: 'edu', name: 'Занятий с полки', unit: 'занятий', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'все занятия' }, ...liveLessons().map(l => ({ value: l.id, label: l.name }))],
    refName: id => liveLessons().find(l => l.id === id)?.name || 'все занятия',
    count: (ref, r) => liveLessons().filter(l => !ref || l.id === ref)
      .reduce((a, l) => a + lessonDates(l).filter(d => inRange(d, r)).length, 0),
  },
  // Свои сферы. Источник один на все — конкретную выбирают в шторке цели,
  // как пилюлю в спорте: заводить по паре источников на каждую новую сферу
  // значило бы дописывать код на каждую сферу, чего мы и уходим.
  sphereLog: {
    sphere: '*', name: 'Отметок в журнале', unit: 'дней', horizons: ['year', 'quarter', 'month'],
    ref: () => customWith('log'),
    refName: key => customName(key),
    count: (ref, r) => Object.keys(sphereLog(ref)).filter(d => inRange(d, r) && sphereLogOn(ref, d) > 0).length,
  },
  sphereSteps: {
    sphere: '*', name: 'Закрытых этапов', unit: 'этапов', horizons: ['year', 'quarter', 'month'],
    ref: () => customWith('steps'),
    refName: key => customName(key),
    count: (ref, r) => sphereItems(ref).filter(i => i.done && inRange((i.doneAt || '').slice(0, 10), r)).length,
  },
  workHours: {
    sphere: 'work', name: 'Отработано часов', unit: 'ч', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => Math.round(workHours(r.from, r.to)),
  },
  workTasks: {
    sphere: 'work', name: 'Задач доведено до конца', unit: 'задач', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => workDoneIn(r.from, r.to).length,
  },
  workWins: {
    sphere: 'work', name: 'Записано в опыт', unit: 'записей', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => winsIn(r.from, r.to).length,
  },
  workOffice: {
    sphere: 'work', name: 'Дней в офисе', unit: 'дней', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => officeDays(r.from, r.to),
  },
  sphereShelf: {
    sphere: '*', name: 'Закрыто на полке', unit: 'штук', horizons: ['year', 'quarter', 'month'], kind: 'shelf',
    ref: () => customWith('shelf'),
    refName: key => customName(key),
    count: (ref, r) => shelfDoneIn(ref, r.from, r.to).length,
  },
  sphereColl: {
    sphere: '*', name: 'Собрано', unit: 'штук', horizons: ['year', 'quarter', 'month'], kind: 'coll',
    ref: () => customWith('coll'),
    refName: key => customName(key),
    count: (ref, r) => collIn(ref, r.from, r.to).length,
  },
  sphereBoard: {
    sphere: '*', name: 'Доведено до конца', unit: 'штук', horizons: ['year', 'quarter', 'month'], kind: 'board',
    ref: () => customWith('board'),
    refName: key => customName(key),
    count: (ref, r) => boardDoneIn(ref, r.from, r.to).length,
  },
  vault: {
    sphere: 'money', name: 'Накоплено в копилке', unit: '₽', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => (S.budget.vaults || []).map(v => ({ value: v.id, label: v.name })),
    refName: id => (S.budget.vaults || []).find(v => v.id === id)?.name || '',
    count: ref => vaultBalance((S.budget.vaults || []).find(v => v.id === ref)),
  },
};

/** Источники, которые эта сфера умеет считать. */
/**
 * Источники этой сферы. Звёздочка — источник своих сфер: он показывается
 * только той сфере, которая эту механику ведёт, и только ей одной, а не
 * всему списку своих сфер сразу.
 */
export const sourcesOf = sphere => Object.entries(SOURCES)
  .filter(([, s]) => (s.sphere === '*' ? (s.ref() || []).some(o => o.value === sphere) : s.sphere === sphere))
  .map(([key, s]) => ({
    key, ...s,
    ...(s.sphere === '*' ? { ref: null, fixedRef: sphere } : {}),
  }));

/** Текущее значение автосчётчика. null — у цели нет источника. */
export function autoCount(goal) {
  const src = SOURCES[goal?.src?.kind];
  if (!src) return null;
  return src.count(goal.src.ref || '', periodRange(goal.horizon, goal.period), goal.period);
}

/** Подпись «откуда число» — чтобы автоматика не выглядела магией. */
export function autoLabel(goal) {
  const src = SOURCES[goal?.src?.kind];
  if (!src) return '';
  const ref = goal.src.ref && src.refName ? src.refName(goal.src.ref) : '';
  return [src.name, ref].filter(Boolean).join(' · ')
    + (src.lifetime ? ' · за всё время' : '');
}

// ── работа: наём ────────────────────────────────────────────────
// Мест работы может быть несколько, и у каждого свой график, оклад, норма
// офиса и отпуск. Поэтому всё считается по месту, а итог складывается —
// но только там, где складывать честно: часы да, ставка нет.
//
// Экран считает нагрузку и границы, а не производительность: сколько часов,
// сколько дней подряд, сколько в офисе. «Мало сделала» тут не считается.

export const workJobs = () => S.work.jobs;
/** Текущие места — те, у кого нет даты окончания. Их может быть несколько. */
export const jobsNow = () => S.work.jobs.filter(j => !j.end)
  .sort((a, b) => (a.start < b.start ? -1 : 1));
export const jobById = id => S.work.jobs.find(j => j.id === id) || null;
export const jobName = id => {
  const j = jobById(id);
  return j ? (j.company || j.title || 'Работа') : '';
};
/** Единственное текущее место — когда оно одно, экран не показывает выбор. */
export const soleJob = () => (jobsNow().length === 1 ? jobsNow()[0] : null);

const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Норма рабочего дня места: от начала до конца минус обед. */
export function jobDayNorm(job) {
  if (!job) return 0;
  const sc = job.sched || {};
  const mins = toMin(sc.end) - toMin(sc.start) - (Number(sc.lunch) || 0);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}
export const jobWeekNorm = job => (job?.sched?.days || []).length * jobDayNorm(job);
/** Норма недели по всем текущим местам — их графики складываются. */
export const weekNormAll = () => jobsNow().reduce((a, j) => a + jobWeekNorm(j), 0);
/** Рабочий ли это день по графику места. */
export const isJobDay = (job, date) => (job?.sched?.days || []).includes(dowIndex(date));

/** Запись дня по месту: { type, hours, where, note } или null. */
export const dayOfJob = (date, jobId) => (S.work.days[date] || {})[jobId] || null;
/** Все записи дня: [{ jobId, ...запись }] — на случай двух мест в один день. */
export const dayEntries = date => Object.entries(S.work.days[date] || {})
  .map(([jobId, r]) => ({ jobId, ...r }));

const datesIn = (from, to) => Object.keys(S.work.days).filter(d => d >= from && d <= to).sort();
/** Записи за отрезок; jobId — по одному месту, null — по всем. */
const recordsIn = (from, to, jobId = null) => datesIn(from, to)
  .flatMap(d => dayEntries(d).filter(e => jobId === null || e.jobId === jobId).map(e => ({ ...e, date: d })));

export const workHours = (from, to, jobId = null) => Math.round(recordsIn(from, to, jobId)
  .reduce((a, e) => a + (e.type === 'work' ? Number(e.hours) || 0 : 0), 0) * 10) / 10;
/** Дни, а не записи: два места в один день — это всё равно один рабочий день. */
export const workedDays = (from, to, jobId = null) => new Set(recordsIn(from, to, jobId)
  .filter(e => e.type === 'work').map(e => e.date)).size;
export const officeDays = (from, to, jobId = null) => new Set(recordsIn(from, to, jobId)
  .filter(e => e.type === 'work' && e.where === 'office').map(e => e.date)).size;
export const daysOfType = (from, to, type, jobId = null) => new Set(recordsIn(from, to, jobId)
  .filter(e => e.type === type).map(e => e.date)).size;

const monthRange = ym => [`${ym}-01`, `${ym}-31`];

export const workMonth = (ym, jobId = null) => {
  const [from, to] = monthRange(ym);
  return {
    hours: workHours(from, to, jobId),
    days: workedDays(from, to, jobId),
    office: officeDays(from, to, jobId),
    vacation: daysOfType(from, to, 'vacation', jobId),
    sick: daysOfType(from, to, 'sick', jobId),
  };
};

export const workWeek = (date, jobId = null) => {
  const days = weekDates(date);
  const from = days[0], to = days[days.length - 1];
  return { hours: workHours(from, to, jobId), days: workedDays(from, to, jobId), office: officeDays(from, to, jobId) };
};

/** Сколько дней подряд работала без единого выходного — по всем местам сразу. */
export function workStreak(from = todayISO()) {
  let n = 0;
  for (let i = 0; i < 60; i++) {
    const d = addDays(from, -i);
    const worked = dayEntries(d).some(e => e.type === 'work');
    if (worked) n++;
    else if (i === 0) continue;      // сегодня могли ещё не отметить
    else break;
  }
  return n;
}

/** Переработка: всё, что сверх нормы дня своего места. */
export const workOver = (from, to, jobId = null) => Math.round(recordsIn(from, to, jobId)
  .reduce((a, e) => a + (e.type === 'work'
    ? Math.max(0, (Number(e.hours) || 0) - jobDayNorm(jobById(e.jobId))) : 0), 0) * 10) / 10;

/**
 * Сколько стоит час у этого места: его оклад делённый на его же часы.
 * По всем местам сразу такое число не считается — складывать ставки разных
 * работодателей бессмысленно, а среднее было бы красивым враньём.
 */
export function jobRate(job, ym) {
  if (!job || !Number(job.salary)) return null;
  const m = workMonth(ym, job.id);
  if (!m.hours) return null;
  return { rate: Math.round(Number(job.salary) / m.hours), hours: m.hours, salary: Number(job.salary) };
}
/** Суммарный доход текущих мест до налогов — это складывать честно. */
export const salaryAll = () => jobsNow().reduce((a, j) => a + (Number(j.salary) || 0), 0);

/** Отпуск за год по месту: сколько использовано из положенного. */
export function jobVacation(job, year = todayISO().slice(0, 4)) {
  const used = daysOfType(`${year}-01-01`, `${year}-12-31`, 'vacation', job?.id ?? null);
  const total = Math.max(0, Number(job?.vacationDays) || 0);
  return { used, total, left: Math.max(0, total - used) };
}

// ── проекты, задачи, победы ─────────────────────────────────────
export const workProjects = jobId => S.work.projects
  .filter(p => !p.archived && (jobId == null || (p.jobId || '') === jobId));
export const workProject = id => S.work.projects.find(p => p.id === id) || null;
export const workProjectName = id => workProject(id)?.name || 'без проекта';

export const workTasks = jobId => S.work.tasks.filter(t => jobId == null || (t.jobId || '') === jobId);
export const tasksInStage = (stage, projectId = null, jobId = null) => workTasks(jobId)
  .filter(t => t.stage === stage && (projectId === null || (t.projectId || '') === projectId));
export const workDoneIn = (from, to, jobId = null) => workTasks(jobId)
  .filter(t => t.stage === 'done' && t.stageAt && t.stageAt >= from && t.stageAt <= to);
/** Задачи со сроком, который уже прошёл или подходит. Без красного — просто список. */
export const workDue = (within = 7, jobId = null) => workTasks(jobId)
  .filter(t => t.stage !== 'done' && t.due && diffDays(t.due, todayISO()) <= within)
  .sort((a, b) => (a.due < b.due ? -1 : 1));

export const workWins = jobId => S.work.wins
  .filter(x => jobId == null || (x.jobId || '') === jobId)
  .sort((a, b) => (a.date < b.date ? 1 : -1));
export const winsIn = (from, to, jobId = null) => workWins(jobId).filter(x => x.date >= from && x.date <= to);

// ── путь ────────────────────────────────────────────────────────
// Места работы во времени. Пересекаться они могут — два найма разом это
// нормально, и на шкале это видно как есть.

/** Все места, новые сверху. */
export const careerLine = () => [...S.work.jobs].sort((a, b) => (a.start < b.start ? 1 : -1));

const monthsBetween = (a, b) => {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1));
};

/**
 * Длительность в месяцах, считая обе границы: «июнь — декабрь» это семь
 * месяцев, а не шесть, — декабрь отработан целиком. Так же считают в резюме.
 */
const monthSpan = (a, b) => monthsBetween(a, b) + 1;
export const jobSpan = j => monthSpan(j.start.slice(0, 7), (j.end || todayISO()).slice(0, 7));

/** «1 год 2 месяца» — длительность словами. */
export function spanLabel(months) {
  const y = Math.floor(months / 12), m = months % 12;
  const yl = y ? `${y} ${plural(y, 'год', 'года', 'лет')}` : '';
  const ml = m ? `${m} ${plural(m, 'месяц', 'месяца', 'месяцев')}` : '';
  return [yl, ml].filter(Boolean).join(' ') || 'меньше месяца';
}

/**
 * Общий стаж: пересекающиеся периоды объединяются. Два найма разом — это
 * по-прежнему один календарный отрезок жизни, а не двойной стаж.
 */
export function careerTotal() {
  const list = S.work.jobs
    .map(j => [j.start.slice(0, 7), (j.end || todayISO()).slice(0, 7)])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!list.length) return 0;
  const merged = [list[0]];
  list.slice(1).forEach(([from, to]) => {
    const last = merged[merged.length - 1];
    if (from <= last[1]) last[1] = to > last[1] ? to : last[1];
    else merged.push([from, to]);
  });
  return merged.reduce((a, [from, to]) => a + monthSpan(from, to), 0);
}

/** Перерыв перед этим местом — если в это время не было вообще никакой работы. */
export function careerGap(index) {
  const list = careerLine();
  const newer = list[index];
  if (!newer) return 0;
  const older = list.slice(index + 1);
  if (!older.length) return 0;
  // Ищем самое позднее окончание среди всех прошлых мест: пока хоть одно
  // из них ещё длилось, перерыва не было.
  const lastEnd = older.reduce((best, j) => {
    const e = j.end || todayISO();
    return e > best ? e : best;
  }, '');
  if (!lastEnd || older.some(j => !j.end)) return 0;
  return Math.max(0, monthsBetween(lastEnd.slice(0, 7), newer.start.slice(0, 7)) - 1);
}
