// Производные значения. Ничего не хранят — считают из состояния,
// чтобы прогресс, потребности и реплики Летописца шли из реальных данных.

import { BLOG_PLACES, BLOG_FEEDS, atPlace, isOut } from './blog.js';
import { FREE_STAGES, isPaid, isLost, isLive, netOf } from './free.js';
import { BIZ_STAGES } from './biz.js';
import { REVIEW_Q, reviewScore, reviewFilled } from './review.js';
import { S, SPHERES, allSpheres, level, levelFloor, isWater, isMeals, MEALS, energyRec, energyAt, energyOn } from './store.js';
export { energyRec, energyAt, energyOn };
import { effects, hasTrait, byId as traitById, nameOf } from './traits.js';
import { COUNTRIES, countryBy, REGIONS } from './countries.js';
import { isMale } from './gender.js';
import { isDoneColumn } from './kanban.js';
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

/** Кривая энергии: 6 блоков от утра к ночи. */
export const ENERGY_BLOCKS = ['7–10', '10–13', '13–16', '16–19', '19–22', '22–01'];
const CURVES = {
  'сова':       [22, 40, 46, 62, 95, 78],
  'жаворонок':  [82, 95, 72, 54, 38, 18],
  'плавает':    [48, 70, 64, 72, 62, 36],
};

/** Кривая из анкеты. Заработанная «Ранняя пташка» перебивает хронотип: факты важнее анкеты. */
export const presetCurve = () => {
  const e = effects();
  if (e.peak === 'morning') return CURVES['жаворонок'];
  if (e.peak === 'evening') return CURVES['сова'];
  return CURVES[S.user.chronotype] || CURVES['плавает'];
};

// ── отметки энергии ─────────────────────────────────────────────
// Отметка привязана к блоку дня: одно число в сутки не говорит, когда оно
// было, и кривая по нему учиться не может.

/** Сколько дней должно отметиться в блоке, чтобы верить своим данным, а не анкете. */
const CURVE_MIN = 3;

/**
 * Кривая дня по блокам. Там, где отметок хватает, берётся среднее по ним;
 * где нет — остаётся анкета. Возвращаем и то, откуда взято число: рисовать
 * предположение так же, как факт, — то же самое, что выдумывать.
 */
export function curveInfo(days = 60) {
  const dates = Array.from({ length: days }, (_, i) => addDays(todayISO(), -i));
  const preset = presetCurve();
  return ENERGY_BLOCKS.map((_, i) => {
    const vals = dates.map(d => energyAt(d, i)).filter(v => v != null);
    if (vals.length < CURVE_MIN) return { value: preset[i], own: false, n: vals.length };
    return { value: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), own: true, n: vals.length };
  });
}
export const energyCurve = () => curveInfo().map(x => x.value);
/** Сколько блоков кривой уже держится на своих отметках. */
export const curveOwn = () => curveInfo().filter(x => x.own).length;

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

// Цель «вниз» бывает и с нулём: «0 см до шпагата» — законная цель, поэтому
// одного «target > 0» мало.
export const isCounter = g => Number(g?.target) > 0 || (Number(g?.target) >= 0 && goalDown(g));

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
    down: goalDown(g),
    from: goalStart(g),
  };
};

/**
 * Цель «вниз»: у неё лучше меньше — сантиметры до шпагата, секунды на круг.
 * Такую цель нельзя мерить как «набрано из нужного»: она движется от того,
 * что было, к тому, что хочется. Точку отсчёта запоминаем при создании, а
 * если её не было (результата ещё не записали) — берём первый записанный.
 */
export const goalDown = g => SOURCES[g?.src?.kind]?.dirOf?.(g.src.ref || '') === 'down';
export function goalStart(g) {
  if (!g?.src) return null;
  const saved = Number(g.src.from);
  if (Number.isFinite(saved) && saved > 0) return saved;
  const ex = g.src.kind === 'exercise' ? exerciseById(g.src.ref) : null;
  const hist = ex ? exerciseHistory(ex.id) : [];
  return hist.length ? hist[0].value : null;
}

/** Прогресс: «выполнено» перебивает всё, дальше счётчик, этапы, вложенные цели, вручную. */
export function goalProgress(goal, seen = new Set()) {
  if (!goal || seen.has(goal.id)) return 0;
  if (goal.done) return 100;
  if (isCounter(goal)) {
    const { current, target, down, from } = counterOf(goal);
    if (down) {
      if (current <= target) return 100;
      // Пути нет — значит, и мерить нечего: не 0 % и не 100, а честный ноль
      // до первой записи.
      if (from == null || from <= target) return 0;
      return Math.max(0, Math.min(100, Math.round(((from - current) / (from - target)) * 100)));
    }
    if (!target) return 0;
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

/**
 * Намерения, к которым может вести цель месяца. Намерения живут на квартале
 * и годе: в месяце их нет намеренно — месяц про то, что делаешь, а не про
 * то, как хочется прожить период.
 */
export function intentionsAbove(ym) {
  const y = ym.slice(0, 4);
  const q = `${y}-Q${Math.ceil(Number(ym.slice(5, 7)) / 3)}`;
  return [[q, 'квартал'], [y, 'год']]
    .flatMap(([key, name]) => (S.intentions?.[key] || []).map(i => ({ ...i, period: key, level: name })));
}
/** Намерение цели: ищем по всем периодам, чтобы не хранить ещё и период. */
export function intentionOf(g) {
  if (!g?.intentId) return null;
  for (const [period, list] of Object.entries(S.intentions || {})) {
    const found = (list || []).find(i => i.id === g.intentId);
    if (found) return { ...found, period };
  }
  return null;
}
/** Цели, ведущие к этому намерению, — чтобы намерение не висело в пустоте. */
export const goalsOfIntent = id => liveGoals().filter(g => g.intentId === id);

export const goalSlots = g => Array.isArray(g.slots) ? g.slots : [];

/** Цели, положенные в этот период сверху — живут выше, но запланированы сюда. */
export const goalsPlannedIn = period => liveGoals().filter(g => g.period !== period && goalSlots(g).includes(period));

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
/** Блюда одного приёма за день. */
export const mealEntries = (date, meal) =>
  ((S.food.days[date] || {}).entries || []).filter(e => (e.meal || '') === meal);
/**
 * Сколько раз за день ела: считаются приёмы, в которых есть хоть одно блюдо.
 * Не блюда — их за обед может быть три, а обед всё равно один.
 */
export const mealsOn = date => MEALS.filter(m => mealEntries(date, m.key).length).length;

export const habitTarget = hb => (isWater(hb)
  ? Math.max(1, Number(S.food.targets.water) || 1)
  : Math.max(1, Number(hb.target) || 1));
export const habitCount = (hb, date) => (isWater(hb)
  ? Math.max(0, Number(S.food.days[date]?.water) || 0)
  : isMeals(hb) ? mealsOn(date)
  : Math.max(0, Number(hb.log?.[date]) || 0));
export const habitDone = (hb, date) => habitCount(hb, date) >= habitTarget(hb);

/** Дни, в которые у привычки есть значение, — с учётом связи. Для выгрузки. */
export const habitDates = hb => (isWater(hb)
  ? Object.keys(S.food.days).filter(d => Number(S.food.days[d]?.water) > 0)
  : isMeals(hb) ? Object.keys(S.food.days).filter(d => mealsOn(d) > 0)
  : Object.keys(hb.log || {}).filter(d => Number(hb.log[d]) > 0)).sort();

/** Единица измерения: у воды она своя и задана «Питанием». */
export const habitUnit = hb => (isWater(hb) ? 'мл' : isMeals(hb) ? 'раз' : hb.unit || '');

export const liveHabits = () => S.habits.filter(hb => !hb.archived);

/** Полные дни месяца — те, где норма закрыта целиком. */
export const habitMonthCount = (hb, ym) => monthDates(ym).filter(d => habitDone(hb, d)).length;
export const habitWeekDone = (hb, date) => weekDates(date).filter(d => habitDone(hb, d)).length;

// ── спорт: тренировки и рекорды ─────────────────────────────────
/** Шаблоны тренировок: без дат, только название и состав. */
export const templates = () => S.sport.templates;
export const templateById = id => templates().find(t => t.id === id);
export const templateName = id => (templateById(id) || {}).name || '';

/** Тренировки дня: со временем — по времени, без него — следом, как есть. */
export const workoutsOn = date => S.sport.workouts.filter(w => w.date === date)
  .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

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

/** Этапы, сданные в отрезке. Без даты сдачи этап в счёт не идёт: когда его
 *  сдали, мы не знаем, а выдумывать дату — врать в счёт цели. */
export const studyDoneIn = (from, to, subjectId = '') => S.study.tasks
  .filter(x => x.stage === 'done' && x.doneAt && x.doneAt >= from && x.doneAt <= to)
  .filter(x => !subjectId || x.subjectId === subjectId);

/** Отмеченные пары в отрезке — по журналу посещений расписания. */
export const studyAttendIn = (from, to, subjectId = '') => {
  const box = S.study.attend || {};
  const keys = subjectId ? [subjectId] : Object.keys(box);
  return keys.reduce((n, k) => n + Object.keys(box[k] || {})
    .filter(d => box[k][d] && d >= from && d <= to).length, 0);
};
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

/** Мерки тела: три опорные — их знают формулы — плюс свои, какие захочет. */
export const BODY_CORE = [
  { key: 'weight', name: 'Вес', unit: 'кг' },   // ИМТ и суточный расход
  { key: 'waist', name: 'Талия', unit: 'см' },  // порог ВОЗ
  { key: 'hips', name: 'Бёдра', unit: 'см' },
];
export const bodyMetrics = () => S.health.metrics || [];
/** Значение мерки в замере: опорные лежат полем, свои — в extra по id. */
export const measureVal = (rec, key) =>
  (BODY_CORE.some(c => c.key === key) ? rec?.[key] : rec?.extra?.[key]) ?? null;

export function measureDeltas() {
  const list = [...S.health.measures].sort((a, b) => a.date.localeCompare(b.date));
  const cur = list[list.length - 1], prev = list[list.length - 2];
  const d = key => {
    const a = measureVal(cur, key), b2 = measureVal(prev, key);
    return cur && prev && a != null && b2 != null ? +(a - b2).toFixed(1) : null;
  };
  const delta = { sleep: d('sleep') };
  [...BODY_CORE.map(c => c.key), ...bodyMetrics().map(m => m.id)].forEach(k => { delta[k] = d(k); });
  return { cur, prev, list, delta };
}

/** Все мерки одним списком — в том порядке, в каком их показывать. */
export const bodyRows = () => [...BODY_CORE.map(c => ({ ...c })),
  ...bodyMetrics().map(m => ({ key: m.id, name: m.name, unit: m.unit }))];

// ── энергия ─────────────────────────────────────────────────────
export const energyDays = () => Object.keys(S.energy).filter(d => energyOn(d) != null).sort();
const mean = list => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);

/** Средняя энергия за месяц — для строки в годовом трекере. */
export const energyMonth = ym => mean(energyDays().filter(d => d.startsWith(ym)).map(d => energyOn(d)));

/** Последние N дней подряд: и пустые тоже, чтобы график не врал про пропуски. */
export function energyRecent(n = 30) {
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(todayISO(), -(n - 1 - i));
    return { date: d, value: energyOn(d) };
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
    (byPhase[ph] ||= []).push(energyOn(d));
  });

  const active = new Set();
  liveLessons().forEach(l => lessonDates(l).forEach(d => active.add(d)));
  marks.forEach(d => { if (questsOn(d).some(q => q.done && q.sphere === 'sport')) active.add(d); });

  const withMove = marks.filter(d => active.has(d)).map(d => energyOn(d));
  const without = marks.filter(d => !active.has(d)).map(d => energyOn(d));

  return {
    count: marks.length,
    avg: mean(marks.map(d => energyOn(d))),
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

// ── сон ─────────────────────────────────────────────────────────
// Отметка привязана ко дню пробуждения: ночь принадлежит тому утру, в
// которое человек встал. Незаполненная ночь — это пусто, а не ноль: ноль
// испортил бы и среднее, и связку с энергией.

export const sleepOn = date => (S.sleep?.[date] == null ? null : Number(S.sleep[date]));
export const sleepDays = () => Object.keys(S.sleep || {}).sort();
export const sleepMarks = (days = 30) => {
  const from = addDays(todayISO(), -(days - 1));
  return sleepDays().filter(d => d >= from && d <= todayISO()).map(d => ({ date: d, h: sleepOn(d) }));
};
export function sleepAvg(days = 30) {
  const v = sleepMarks(days).map(x => x.h).filter(x => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}
export const sleepMonth = ym => {
  const v = sleepDays().filter(d => d.startsWith(ym)).map(d => sleepOn(d)).filter(x => x != null);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
};

/**
 * Сон и энергия рядом. Порог — своя норма; сравниваем средние по дням, где
 * есть и то и другое. Меньше трёх ночей с каждой стороны — не считаем:
 * на двух ночах «связь» была бы выдумкой.
 */
export function sleepVsEnergy(days = 60) {
  const norm = Number(S.user.sleep) || 8;
  const rows = sleepMarks(days).map(x => ({ ...x, e: energyOn(x.date) })).filter(x => x.e != null);
  const long = rows.filter(x => x.h >= norm).map(x => x.e);
  const short = rows.filter(x => x.h < norm).map(x => x.e);
  if (long.length < 3 || short.length < 3) return null;
  const mean2 = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  return { norm, long: mean2(long), short: mean2(short), nLong: long.length, nShort: short.length };
}

/** Потребности за последние 7 дней: 0..100. null — данных пока нет. */
export function needs() {
  const days = lastDays(7);
  // Сначала свои отметки за неделю; их нет — старые «замеры сна» из «Тела»;
  // нет и их — привычка про сон. Одно число, три источника по убыванию точности.
  const week = days.map(d => sleepOn(d)).filter(x => x != null);
  const meas = S.health.measures.filter(m => m.sleep != null).slice(-3);
  const avg = week.length ? week.reduce((a, b) => a + b, 0) / week.length
    : meas.length ? meas.reduce((a, m) => a + m.sleep, 0) / meas.length : null;
  const sleep = avg != null ? Math.min(100, Math.round((avg / S.user.sleep) * 100))
                            : habitRate(/сон|спать/i, days);
  return [
    { key: 'sleep', name: 'Сон', value: sleep, hint: 'отмечается на «Дне» ползунком' },
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
  // «Тело» живо от отметок сна и замеров: у него нет этапов и журнала,
  // и без этой ветки роль «Целительница» видела бы только квесты.
  if (key === 'biz') return [quests,
    { label: 'запуски', n: bizProjects().filter(p => days.includes(p.launched)).length },
    { label: 'отметки', n: bizProjects().reduce((a, p) => a + (p.marks || []).filter(m => days.includes(m.date)).length, 0) }];
  if (key === 'free') return [quests,
    { label: 'заказы', n: freeOrders().filter(o => isPaid(o) && days.includes(o.paidAt)).length },
    { label: 'шаги', n: 0 }].filter(x => x.label !== 'шаги' || x.n);
  if (key === 'health') return [quests,
    { label: 'ночи', n: days.filter(d => sleepOn(d) != null).length },
    { label: 'замеры', n: (S.health.measures || []).filter(m => days.includes(m.date)).length }];
  // «Страны» отмечаются годом, а не датой, поэтому в двухнедельное окно им
  // попасть нечем: считаем только квесты, а не выдумываем поездке день.
  // Своя сфера приносит закрытые этапы с датой и отметки журнала.
  // У блога закрытый этап — это опубликованный пост, так его и называем.
  const inDays = d => days.includes((d || '').slice(0, 10));
  if (key === 'blog') return [quests, { label: 'посты', n: blogPosts().filter(p => isOut(p) && inDays(p.day)).length }];
  return [quests,
    { label: 'этапы', n: sphereItems(key).filter(i => i.done && inDays(i.doneAt)).length },
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
  const e = energyOn(date);
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

/** Дело без одной отметки — чтобы спросить «а пора ли было до неё». */
export const withoutMark = (it, date) => {
  const log = (it.log || []).filter(d => d !== date);
  return { ...it, log, last: it.last === date ? (log[log.length - 1] || '') : it.last };
};

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
  // Разовое занятие: не правило, а один назначенный день. Такое бывает чаще,
  // чем кажется, — вокал на неделе переносят, врач принимает во вторник.
  if (sc.date) return sc.date === date;
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
  const days = sc.date ? dayShort(sc.date)
    : (sc.days || []).slice().sort((a, b) => a - b).map(d => DOW[d].toLowerCase()).join(', ');
  const parts = [days];
  if (!sc.date && Number(sc.every) === 2) parts.push('раз в две недели');
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
    `Энергия сегодня: ${energyOn(t) ?? 'не отмечена'}${e7.length ? `, в среднем за неделю ${Math.round(e7.reduce((a, x) => a + x.value, 0) / e7.length)}` : ''}.`,
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
  // Имя нарочно не inRange: так называется проверка «дата внутри отрезка»,
  // и здесь она была заслонена массивом — читалось как ошибка.
  const measured = [...S.health.measures].filter(m => m.date >= from).sort((a, b) => a.date.localeCompare(b.date));
  const first = measured[0], last = measured[measured.length - 1];
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

/**
 * Жиры от веса: около грамма на килограмм, ориентир 0,8–1,2. Ниже нижней
 * границы жиры обычно не опускают — это не про похудение, а про гормоны.
 */
export function fatHint() {
  const cur = measureDeltas().cur;
  const kg = cur && cur.weight != null ? Number(cur.weight) : null;
  if (!kg) return null;
  return { kg, mid: Math.round(kg), low: Math.round(kg * 0.8), high: Math.round(kg * 1.2), date: cur.date };
}

/** Вода от веса: 30 мл на килограмм — привычный ориентир, не предписание. */
export function waterHint() {
  const cur = measureDeltas().cur;
  const kg = cur && cur.weight != null ? Number(cur.weight) : null;
  if (!kg) return null;
  return { kg, ml: Math.round(kg * 30 / 50) * 50, date: cur.date };
}

/**
 * Углеводы — остаток калорий после белка и жира: 4 ккал на грамм белка и
 * углеводов, 9 на грамм жира. Считается от того, что стоит в полях сейчас,
 * поэтому меняется вслед за ними. Если остатка нет, честно возвращаем ноль
 * и причину, а не отрицательное число.
 */
export function carbRest(kcal, prot, fat) {
  const k = Math.max(0, Number(kcal) || 0);
  const p = Math.max(0, Number(prot) || 0);
  const f = Math.max(0, Number(fat) || 0);
  const left = k - p * 4 - f * 9;
  return { g: Math.max(0, Math.round(left / 4)), left: Math.round(left), enough: left >= 0, kcal: k, prot: p, fat: f };
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
 * ни норм веса, ни рекомендаций отсюда не выводится. Живёт в «Теле», рядом
 * с тем, что объясняет, а не в анкете профиля.
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
// ── бюджет ──────────────────────────────────────────────────────
// Считалось это в самом экране, а брала цифру ещё и плитка сферы: вычисления
// живут здесь, чтобы у остатка было одно определение на приложение.
const inMonthOp = (op, m) => (op.date || '').startsWith(m);

export const sumBy = (m, kind) => S.budget.ops
  .filter(o => o.kind === kind && inMonthOp(o, m))
  .reduce((a, o) => a + (Number(o.sum) || 0), 0);

/**
 * Остаток на конец месяца: стартовая сумма плюс всё, что случилось до конца
 * этого месяца. «-32» — заведомо больший день: даты сравниваются строками, и
 * так в срез попадает и 31-е число.
 */
export function balanceAt(m) {
  const end = m + '-32';
  return S.budget.ops.filter(o => (o.date || '') < end).reduce((acc, o) => {
    if (o.kind === 'income') return acc + (Number(o.sum) || 0);
    // Расход уходит совсем, отложенное — с баланса в копилку: для остатка это
    // одно и то же движение, поэтому и знак один.
    return acc - (Number(o.sum) || 0);
  }, S.budget.start);
}

export function periodRange(horizon, period) {
  if (horizon === 'month') return { from: `${period}-01`, to: `${period}-${String(daysInMonth(period)).padStart(2, '0')}` };
  if (horizon === 'quarter') {
    const ms = quarterMonths(period);
    return { from: `${ms[0]}-01`, to: `${ms[2]}-${String(daysInMonth(ms[2])).padStart(2, '0')}` };
  }
  return { from: `${period}-01-01`, to: `${period}-12-31` };
}

const inRange = (d, r) => !!d && d >= r.from && d <= r.to;

/** Месяцы, которые задевает отрезок: значения трекера ведутся помесячно.
 *  Имя не monthsBetween — та ниже считает их количество, а не перечисляет. */
function monthKeysIn(from, to) {
  const out = [];
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = addMonths(ym, 1)) out.push(ym);
  return out;
}

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

/**
 * Модуль по его собственному имени. Раньше цель ссылалась на модуль строкой
 * «занятие:модуль» — двумя именами через двоеточие. У модуля есть своё имя,
 * уникальное на всё приложение, и одного достаточно: склеенная ссылка ни в
 * какую таблицу не ложится и разъезжается при первом же переносе.
 */
export function moduleById(id) {
  for (const lesson of liveLessons()) {
    const module = (lesson.items || []).find(m => m.id === id);
    if (module) return { lesson, module };
  }
  return null;
}

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
    sphere: 'trips', name: 'Стран за жизнь', unit: 'стран', horizons: ['year', 'quarter', 'month'], lifetime: true,
    count: () => countriesEver().length,
  },
  posts: {
    sphere: 'blog', name: 'Постов', unit: 'постов', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...BLOG_PLACES.filter(p => p.key !== 'both').map(p => ({ value: p.key, label: p.name }))],
    refName: id => BLOG_PLACES.find(p => p.key === id)?.name || '',
    count: (ref, r) => blogOutIn(r.from, r.to, ref).length,
  },
  subs: {
    // Не за период, а «сколько сейчас»: подписчики — это уровень, а не
    // накопление за месяц. Поэтому lifetime, как страны за всю жизнь.
    sphere: 'blog', name: 'Подписчиков всего', unit: 'подписчиков', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => [{ value: '', label: 'везде' }, ...BLOG_FEEDS.map(f => ({ value: f.key, label: f.name }))],
    refName: id => BLOG_FEEDS.find(f => f.key === id)?.name || '',
    count: ref => subsNow(ref) || 0,
  },
  subsGain: {
    sphere: 'blog', name: 'Прирост подписчиков', unit: 'подписчиков', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...BLOG_FEEDS.map(f => ({ value: f.key, label: f.name }))],
    refName: id => BLOG_FEEDS.find(f => f.key === id)?.name || '',
    count: (ref, r) => subsGain(ref, r.from, r.to),
  },
  views: {
    sphere: 'blog', name: 'Просмотров', unit: 'просмотров', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...BLOG_PLACES.filter(p => p.key !== 'both').map(p => ({ value: p.key, label: p.name }))],
    refName: id => BLOG_PLACES.find(p => p.key === id)?.name || '',
    count: (ref, r) => viewsSum(r.from, r.to, ref),
  },
  viewsTop: {
    // Рекорд, а не сумма: «хочу пост на 10 000» — это про один пост.
    sphere: 'blog', name: 'Лучший пост по просмотрам', unit: 'просмотров', horizons: ['year', 'quarter', 'month'], lifetime: true,
    count: () => viewsRecordValue(),
  },
  workouts: {
    sphere: 'sport', name: 'Тренировок', unit: 'тренировок', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => doneWorkouts(r).length,
  },
  exercise: {
    // Не «сколько раз», а «до какого результата»: планка на 3 минуты, первое
    // подтягивание, сантиметры до шпагата. Единица и направление берутся
    // у самого упражнения — у шпагата «лучше» значит меньше.
    sphere: 'sport', name: 'Рекорд в упражнении', unit: '', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => S.sport.exercises.map(e => ({ value: e.id, label: e.name })),
    refName: id => exerciseById(id)?.name || '',
    unitOf: id => exerciseById(id)?.unit || '',
    dirOf: id => (exerciseById(id)?.dir === 'down' ? 'down' : 'up'),
    count: (ref, _r, _p, goal) => {
      const ex = exerciseById(ref);
      const rec = ex && exerciseRecord(ex);
      if (rec) return rec.best;
      // Результата ещё нет: у цели «вверх» это ноль, у цели «вниз» — точка,
      // с которой начинали. Ноль там означал бы «шпагат уже сел».
      return goalStart(goal) ?? 0;
    },
  },
  tag: {
    sphere: 'sport', name: 'Тренировок с пилюлей', unit: 'раз', horizons: ['year', 'quarter', 'month'],
    ref: () => sportTags().map(t => ({ value: t.id, label: t.name })),
    refName: id => tagById(id)?.name || '',
    count: (ref, r) => doneWorkouts(r).filter(w => (w.tags || []).includes(ref)).length,
  },
  courseModule: {
    // «Пройти модуль». Уроки внутри модуля дат не имеют, поэтому счёт за
    // всё время: срок у такой цели — когда хочется дойти, а не окно.
    sphere: 'edu', name: 'Пройти модуль', unit: 'уроков', horizons: ['year', 'quarter', 'month'], lifetime: true,
    // Пройденный модуль в списке не нужен: цель на него ничего не изменит.
    ref: () => liveLessons().flatMap(l => (l.items || [])
      .filter(m => ((m.lessons || []).length ? !m.lessons.every(x => x.done) : !m.done))
      .map(m => ({ value: m.id, label: `${l.name} · ${m.title}` }))),
    refName: id => {
      const found = moduleById(id);
      return found ? `${found.lesson.name} · ${found.module.title}` : '';
    },
    // Сколько всего — подсказка для поля «сколько»: у модуля с уроками это
    // их число, у модуля без уроков — единица, он либо пройден, либо нет.
    suggest: id => (moduleById(id)?.module.lessons || []).length || 1,
    count: ref => {
      const m = moduleById(ref)?.module;
      if (!m) return 0;
      return (m.lessons || []).length ? m.lessons.filter(x => x.done).length : (m.done ? 1 : 0);
    },
  },
  studyTask: {
    // «Сдать вот этот этап». Срок у такой цели — когда хочется дойти, а не
    // окно счёта: этап сдают один раз, и в начале квартала он не сбрасывается.
    sphere: 'study', name: 'Сдать этап', unit: 'этапов', horizons: ['year', 'quarter', 'month'], lifetime: true,
    // Предлагаем только несданное: ставить цель на уже закрытое незачем.
    ref: () => S.study.tasks.filter(x => x.stage !== 'done')
      .map(x => ({ value: x.id, label: `${x.title} · ${taskSubject(x).name}` })),
    refName: id => {
      const x = S.study.tasks.find(y => y.id === id);
      return x ? `${x.title} · ${taskSubject(x).name}` : '';
    },
    suggest: () => 1,
    count: ref => (S.study.tasks.find(x => x.id === ref)?.stage === 'done' ? 1 : 0),
  },
  trackerRow: {
    // Свои строки трекера: человек ведёт там что угодно своими руками, и цель
    // на это должна ставиться так же, как на всё остальное.
    sphere: 'tracker', group: 'Трекер года', name: 'Своя строка трекера', unit: '',
    horizons: ['year', 'quarter', 'month'],
    ref: () => (S.tracker.rows || []).map(r => ({ value: r.id, label: r.name })),
    refName: id => (S.tracker.rows || []).find(r => r.id === id)?.name || '',
    unitOf: id => (S.tracker.rows || []).find(r => r.id === id)?.unit || '',
    count: (ref, r) => monthKeysIn(r.from, r.to)
      .reduce((a, ym) => a + (Number(S.tracker.values?.[ref]?.[ym]) || 0), 0),
  },
  studyDone: {
    sphere: 'study', name: 'Этапов сдано', unit: 'этапов', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'по всем предметам' },
      ...liveSubjects().map(x => ({ value: x.id, label: x.name }))],
    refName: id => liveSubjects().find(x => x.id === id)?.name || 'по всем предметам',
    count: (ref, r) => studyDoneIn(r.from, r.to, ref).length,
  },
  studyAttend: {
    sphere: 'study', name: 'Пар посещено', unit: 'пар', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'по всем предметам' },
      ...liveSubjects().map(x => ({ value: x.id, label: x.name }))],
    refName: id => liveSubjects().find(x => x.id === id)?.name || 'по всем предметам',
    count: (ref, r) => studyAttendIn(r.from, r.to, ref),
  },
  courseAll: {
    sphere: 'edu', name: 'Пройти курс', unit: 'модулей', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => liveLessons()
      .filter(l => (l.items || []).length)
      .filter(l => !l.items.every(m => ((m.lessons || []).length ? m.lessons.every(x => x.done) : m.done)))
      .map(l => ({ value: l.id, label: l.name })),
    refName: id => liveLessons().find(l => l.id === id)?.name || '',
    suggest: id => (liveLessons().find(l => l.id === id)?.items || []).length || 1,
    count: ref => {
      const l = liveLessons().find(x => x.id === ref);
      return (l?.items || []).filter(m => ((m.lessons || []).length ? m.lessons.every(x => x.done) : m.done)).length;
    },
  },
  habit: {
    // Привычка — не сфера, поэтому в «Цель отсюда» этот счёт не попадает:
    // он живёт только там, где выбирают источник вручную. Считаем дни с
    // закрытой нормой — ровно то, что показывает строка привычки в трекере.
    sphere: 'habits', group: 'Ритм дня', name: 'Дней с привычкой', unit: 'дней',
    horizons: ['year', 'quarter', 'month'],
    ref: () => liveHabits().map(hb => ({ value: hb.id, label: hb.name })),
    refName: id => liveHabits().find(hb => hb.id === id)?.name || '',
    count: (ref, r) => {
      const hb = liveHabits().find(x => x.id === ref);
      if (!hb) return 0;
      return datesBetween(r.from, r.to).filter(d => habitDone(hb, d)).length;
    },
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
  // «Осознанность» — не сфера, поэтому цель на неё ставится из «Внутри»:
  // источник живёт под ключом 'inside' и туда же приводит кнопка.
  mindDays: {
    sphere: 'inside', group: 'Осознанность', name: 'Дней с практикой', unit: 'дней', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => mindDays(r.from, r.to),
  },
  mindMinutes: {
    sphere: 'inside', group: 'Осознанность', name: 'Минут практики', unit: 'мин', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => mindMinutes(r.from, r.to),
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
  bizLaunched: {
    sphere: 'biz', name: 'Проектов запущено', unit: 'проектов', horizons: ['year', 'quarter', 'month'],
    count: (_ref, r) => bizLaunchedIn(r.from, r.to).length,
  },
  bizMetric: {
    // Показатель продукта — уровень, а не накопление за месяц: «дойти до
    // ста пользователей». Поэтому за всё время, как рекорд в упражнении.
    sphere: 'biz', name: 'Показатель проекта', unit: '', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => bizMetricRefs(),
    refName: id => bizMetricRefs().find(x => x.value === id)?.label || '',
    unitOf: id => bizMetricById(id)?.metric.unit || '',
    count: ref => bizBest(ref),
  },
  freeOrders: {
    sphere: 'free', name: 'Заказов оплачено', unit: 'заказов', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...freePlaces().map(x => ({ value: x.id, label: x.name }))],
    refName: id => freePlaces().find(x => x.id === id)?.name || '',
    count: (ref, r) => freePaidIn(r.from, r.to, ref).length,
  },
  freeMoney: {
    sphere: 'free', name: 'Заработано на фрилансе', unit: '₽', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...freePlaces().map(x => ({ value: x.id, label: x.name }))],
    refName: id => freePlaces().find(x => x.id === id)?.name || '',
    count: (ref, r) => freeGross(r.from, r.to, ref),
  },
  freeNet: {
    // Чистыми — то, что осталось после комиссии площадки. Кворк забирает
    // пятую часть, и цель «заработать N» без этого была бы обманом.
    sphere: 'free', name: 'Чистыми после комиссии', unit: '₽', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'везде' }, ...freePlaces().map(x => ({ value: x.id, label: x.name }))],
    refName: id => freePlaces().find(x => x.id === id)?.name || '',
    count: (ref, r) => freeNet(r.from, r.to, ref),
  },
  income: {
    // Доход за период — из операций, а не отдельным счётчиком: одна запись
    // в бюджете, и цель растёт сама. Без статьи считаются все доходы.
    sphere: 'money', name: 'Заработано', unit: '₽', horizons: ['year', 'quarter', 'month'],
    ref: () => [{ value: '', label: 'все статьи' },
      ...(S.budget.cats.income || []).map(c => ({ value: c.id, label: c.name }))],
    refName: id => (S.budget.cats.income || []).find(c => c.id === id)?.name || '',
    count: (ref, r) => Math.round(S.budget.ops
      .filter(o => o.kind === 'income' && inRange(o.date, r) && (!ref || o.catId === ref))
      .reduce((a, o) => a + (Number(o.sum) || 0), 0)),
  },
  vault: {
    sphere: 'money', name: 'Накоплено в копилке', unit: '₽', horizons: ['year', 'quarter', 'month'], lifetime: true,
    ref: () => (S.budget.vaults || []).map(v => ({ value: v.id, label: v.name })),
    refName: id => (S.budget.vaults || []).find(v => v.id === id)?.name || '',
    count: ref => vaultBalance((S.budget.vaults || []).find(v => v.id === ref)),
  },
};

/** Все даты отрезка — нужен там, где счёт идёт по дням, а не по записям. */
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Всё, что приложение умеет считать за этот срок, — для ручного выбора
 * источника у динамичной цели. Здесь и сферы, и то, что сферой не является:
 * привычки живут в «Ритме», а не в сфере, но считать их так же законно.
 */
export const countableFor = horizon => Object.entries(SOURCES)
  .filter(([, s2]) => s2.horizons.includes(horizon) && hasRefs(s2))
  .map(([key, s2]) => ({
    key, ...s2,
    group: s2.group || (s2.sphere === '*' ? 'Свои сферы' : sphereOf(s2.sphere)?.name || s2.sphere),
  }));

/** Источники, которые эта сфера умеет считать. */
/**
 * Источники этой сферы. Звёздочка — источник своих сфер: он показывается
 * только той сфере, которая эту механику ведёт, и только ей одной, а не
 * всему списку своих сфер сразу.
 */
/** Счёт, которому нечего уточнять, предлагать нельзя: цель на несуществующий
 *  модуль или пилюлю считалась бы вечным нулём. */
const hasRefs = s => !s.ref || (s.ref() || []).length > 0;

export const sourcesOf = sphere => Object.entries(SOURCES)
  .filter(([, s]) => (s.sphere === '*' ? (s.ref() || []).some(o => o.value === sphere) : s.sphere === sphere))
  .filter(([, s]) => s.sphere === '*' || hasRefs(s))
  .map(([key, s]) => ({
    key, ...s,
    ...(s.sphere === '*' ? { ref: null, fixedRef: sphere } : {}),
  }));

/** Текущее значение автосчётчика. null — у цели нет источника. */
export function autoCount(goal) {
  const src = SOURCES[goal?.src?.kind];
  if (!src) return null;
  return src.count(goal.src.ref || '', periodRange(goal.horizon, goal.period), goal.period, goal);
}

/** Подпись «откуда число» — чтобы автоматика не выглядела магией.
 *  У целей «за всё время» срок — это не окно счёта, а когда хочется дойти:
 *  рекорд не сбрасывается в начале квартала, поэтому так и подписано. */
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

// ── доска, задачи, победы ───────────────────────────────────────
export const workTasks = jobId => S.work.tasks.filter(t => jobId == null || (t.jobId || '') === jobId);
export const taskById = id => S.work.tasks.find(t => t.id === id) || null;

/** Подходит ли карточка под фильтры доски. */
export function cardMatches(c, f) {
  if (f.type && c.type !== f.type) return false;
  if (f.platform && !(c.platforms || []).includes(f.platform)) return false;
  if (f.month && c.month !== f.month) return false;
  if (f.urgent && !c.urgent) return false;
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [c.title, c.notes, c.request, c.split, c.budget].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export const cardsIn = (column, jobId, f) => workTasks(jobId)
  .filter(c => c.column === column && cardMatches(c, f));

/** Месяцы, которые встречаются на доске, — для фильтра. */
export const boardMonths = () => [...new Set(S.work.tasks.map(c => c.month).filter(Boolean))].sort();

/** Готовность чек-листа: сколько из скольких. */
export const checkDone = c => (c.checklist || []).filter(x => x.done).length;

/**
 * Дата у карточки — это день, когда её делают. Поэтому «на сегодня» и
 * «дальше» разведены: сегодняшнее нужно видеть, будущее не должно маячить.
 * Закрытые колонки не считаются.
 */
export const workToday = (jobId = null) => workTasks(jobId)
  .filter(t => !isDoneColumn(t.column) && t.day && t.day <= todayISO())
  .sort((a, b) => (a.day < b.day ? -1 : 1));
export const workAhead = (within = 14, jobId = null) => workTasks(jobId)
  .filter(t => !isDoneColumn(t.column) && t.day && t.day > todayISO()
    && diffDays(t.day, todayISO()) <= within)
  .sort((a, b) => (a.day < b.day ? -1 : 1));
export const workTodayCount = () => workToday().length;

/** Дедлайн: просрочен, сегодня, скоро — как на исходной доске. */
export function deadlineInfo(dl) {
  if (!dl) return null;
  const d = diffDays(dl, todayISO());
  if (d < 0) return { cls: 'dl-over', label: `просрочен ${dayShort(dl)}` };
  if (d === 0) return { cls: 'dl-today', label: 'сегодня' };
  if (d <= 3) return { cls: 'dl-soon', label: dayShort(dl) };
  return { cls: '', label: dayShort(dl) };
}

export const workDoneIn = (from, to, jobId = null) => workTasks(jobId)
  .filter(t => isDoneColumn(t.column) && t.movedAt && t.movedAt >= from && t.movedAt <= to);

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

// ── осознанность ────────────────────────────────────────────────
// Журнал практик. Приложение не обещает эффекта: оно кладёт рядом то, что
// человек отметил до и после, — и если разницы нет, так и будет видно.

export const mindLog = () => [...(S.mind || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
export const mindIn = (from, to) => (S.mind || []).filter(x => x.date >= from && x.date <= to);
export const mindMinutes = (from, to) => mindIn(from, to).reduce((a, x) => a + (Number(x.minutes) || 0), 0);
export const mindDays = (from, to) => new Set(mindIn(from, to).map(x => x.date)).size;
// ── недельный анализ ────────────────────────────────────────────
// Анкета живёт по неделям, а трекер — по месяцам. Месяц берёт среднее по
// тем неделям, что в него попали: пропущенная неделя не считается нулём,
// иначе один пропуск проваливал бы весь месяц.

export const reviews = () => S.review || {};
export const reviewOf = wk => reviews()[wk] || null;
export const reviewWeeks = () => Object.keys(reviews()).filter(k => reviewFilled(reviews()[k])).sort();
export const reviewScoreOf = wk => reviewScore(reviewOf(wk));

/** Недели месяца — по понедельнику: неделя принадлежит тому месяцу, в котором началась. */
export const weeksOfMonthKey = ym => reviewWeeks().filter(wk => monthKey(mondayOf(wk)) === ym);
/** Понедельник недели по её ключу: '2026-W35' → дата. */
export function mondayOf(wk) {
  const [y, w] = String(wk).split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return mon.toISOString().slice(0, 10);
}

export function reviewMonth(ym) {
  const vals = weeksOfMonthKey(ym).map(reviewScoreOf).filter(v => v != null);
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
}

/** Что просело и что держится: средние по вопросам за последние недели. */
export function reviewParts(n = 8) {
  const weeks = reviewWeeks().slice(-n);
  return REVIEW_Q.map(q => {
    const vals = weeks.map(wk => Number(reviewOf(wk)?.scores?.[q.key])).filter(v => v >= 1 && v <= 5);
    return { ...q, avg: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null, n: vals.length };
  });
}

// ── моё дело ────────────────────────────────────────────────────
// Проект живёт своими числами: у каждого свои показатели и свои отметки.
// Общего «успеха» приложение не считает — что тут успех, знает только автор.

export const bizProjects = () => S.biz?.projects || [];
export const bizById = id => bizProjects().find(p => p.id === id);
export const bizBy = stage => bizProjects().filter(p => p.stage === stage);
export const bizLive = () => bizBy('live');
/** Запущенные за отрезок — по дню запуска; без него в счёт не идут. */
export const bizLaunchedIn = (from, to) => bizProjects()
  .filter(p => p.launched && p.launched >= from && p.launched <= to);

export const bizSteps = pr => pr?.steps || [];
export const bizStepsLeft = pr => bizSteps(pr).filter(x => !x.done).length;
export function bizProgress(pr) {
  const st = bizSteps(pr);
  return st.length ? Math.round((st.filter(x => x.done).length / st.length) * 100) : null;
}

export const bizMetrics = pr => pr?.metrics || [];
export const bizMarks = (pr, metricId) => (pr?.marks || [])
  .filter(m => m.metricId === metricId).sort((a, b) => (a.date < b.date ? -1 : 1));
/** Последняя отметка показателя и сдвиг от предыдущей. */
export function bizLast(pr, metricId) {
  const list = bizMarks(pr, metricId);
  if (!list.length) return null;
  const last = list[list.length - 1], prev = list[list.length - 2];
  return { value: last.value, date: last.date, delta: prev ? +(last.value - prev.value).toFixed(1) : null, n: list.length };
}
/**
 * Показатель по его собственному имени. Как и модуль занятия, раньше он
 * назывался парой «проект:показатель» через двоеточие; своего имени
 * показателю хватает, а склеенная ссылка ни в какую таблицу не ложится.
 */
export function bizMetricById(id) {
  for (const project of bizProjects()) {
    const metric = bizMetrics(project).find(m => m.id === id);
    if (metric) return { project, metric };
  }
  return null;
}

/** Лучшее значение показателя за всё время — по нему ставится цель. */
export function bizBest(metricId) {
  const found = bizMetricById(metricId);
  const list = found ? bizMarks(found.project, metricId).map(m => m.value) : [];
  return list.length ? Math.max(...list) : 0;
}
/** Пары «проект · показатель» для выбора в цели. */
export const bizMetricRefs = () => bizProjects().flatMap(pr =>
  bizMetrics(pr).map(m => ({ value: m.id, label: `${pr.name} · ${m.name}` })));

// ── фриланс ─────────────────────────────────────────────────────
// Деньги считаются от оплаченных заказов и только по дню оплаты: «сдан» —
// это ещё не деньги, и записывать его в доход значило бы считать надежду.

export const freeOrders = () => S.free?.orders || [];
export const freeBy = stage => freeOrders().filter(o => o.stage === stage);
export const freeLive = () => freeOrders().filter(isLive)
  .sort((a, b) => ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
export const freePlaces = () => S.free?.places || [];
export const freeServices = () => S.free?.services || [];
export const freeSteps = () => S.free?.steps || [];

export const freePaid = (place = '') => freeOrders()
  .filter(o => isPaid(o) && o.paidAt && (!place || o.placeId === place))
  .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
export const freePaidIn = (from, to, place = '') =>
  freePaid(place).filter(o => o.paidAt >= from && o.paidAt <= to);
export const freeGross = (from, to, place = '') =>
  freePaidIn(from, to, place).reduce((a, o) => a + (Number(o.price) || 0), 0);
export const freeNet = (from, to, place = '') =>
  freePaidIn(from, to, place).reduce((a, o) => a + netOf(o), 0);
export function freeAvg(from, to, place = '') {
  const list = freePaidIn(from, to, place);
  return list.length ? Math.round(freeGross(from, to, place) / list.length) : null;
}

/** Ближайшие сроки живых заказов — тихо, на самой сфере. */
export const freeDue = (within = 30) => freeLive()
  .filter(o => o.due && diffDays(o.due, todayISO()) <= within);

/** Что приносит каждая площадка: заказы, деньги и средний чек за всё время. */
export function freePlaceStats() {
  const all = freePaid();
  return freePlaces().map(pl => {
    const mine = all.filter(o => o.placeId === pl.id);
    const gross = mine.reduce((a, o) => a + (Number(o.price) || 0), 0);
    return { ...pl, n: mine.length, gross, net: mine.reduce((a, o) => a + netOf(o), 0),
      avg: mine.length ? Math.round(gross / mine.length) : null };
  }).sort((a, b) => b.gross - a.gross);
}

/** Воронка: сколько заказов на каждой стадии — включая сорвавшиеся. */
export const freeFunnel = () => FREE_STAGES.map(st => ({ ...st, n: freeBy(st.key).length }));
export const freeStepsDone = () => freeSteps().filter(x => x.done).length;

// ── блог ────────────────────────────────────────────────────────
// Ритм и отклик — разные вещи. Ритм считается сам из постов, доехавших до
// «опубликовано»; отклик человек вписывает руками, и только если хочет.

export const blogPosts = () => S.blog?.posts || [];
export const blogBy = stage => blogPosts().filter(p => p.stage === stage);
/** Вышедшие: сначала свежие. Без дня выхода пост в ритм не попадает —
 *  дату публикации мы не выдумываем, но из списка он не исчезает. */
export const blogOut = (place = '') => blogBy('out').filter(p => atPlace(p, place))
  .sort((a, b) => ((a.day || '') < (b.day || '') ? 1 : -1));
export const blogOutIn = (from, to, place = '') =>
  blogOut(place).filter(p => p.day && p.day >= from && p.day <= to);
export const blogMonth = (ym, place = '') => blogOutIn(`${ym}-01`, `${ym}-31`, place).length;
export const blogYear = (y, place = '') => blogOutIn(`${y}-01-01`, `${y}-12-31`, place).length;
export const blogTotal = (place = '') => blogOut(place).filter(p => p.day).length;

/** Ближайшие выходы: тихо, на экране сферы — в «День» они не лезут. */
export const blogAhead = (within = 30) => blogPosts()
  .filter(p => !isOut(p) && p.day && p.day >= todayISO() && diffDays(p.day, todayISO()) <= within)
  .sort((a, b) => (a.day < b.day ? -1 : 1));

/** Лучший по просмотрам: за отрезок и за всё время. Без чисел — null. */
const bestBy = list => list.filter(p => p.views != null)
  .reduce((best, p) => (!best || p.views > best.views ? p : best), null);
export const viewsBest = (from, to) => bestBy(blogOutIn(from, to));
export const viewsRecord = () => bestBy(blogOut());
export const viewsMonth = ym => viewsBest(`${ym}-01`, `${ym}-31`);

/** Подписчики: отметки по датам, последняя и разница с предыдущей. */
export const subsMarks = () => (S.blog?.subs || []).filter(x => x.ig != null || x.tg != null);
export const subsLast = () => subsMarks().slice(-1)[0] || null;
export function subsDelta(feed) {
  const marks = subsMarks().filter(x => x[feed] != null);
  if (marks.length < 2) return null;
  return marks[marks.length - 1][feed] - marks[marks.length - 2][feed];
}

/** Последнее известное число по площадке — у каждой своё: отметка, где
 *  заполнили только инстаграм, не должна обнулять телеграм. */
export function subsLastOf(feed, upto = '9999-12-31') {
  const marks = subsMarks().filter(x => x[feed] != null && x.date <= upto);
  return marks.length ? marks[marks.length - 1][feed] : null;
}
/** Сколько сейчас: по площадке или суммой. Пусто — значит ещё не отмечали. */
export function subsNow(feed = '', upto = '9999-12-31') {
  if (feed) return subsLastOf(feed, upto);
  const n = BLOG_FEEDS.map(f => subsLastOf(f.key, upto)).filter(v => v != null);
  return n.length ? n.reduce((a, b) => a + b, 0) : null;
}
export const subsTotal = () => subsNow();

/**
 * Прирост за отрезок. Точка отсчёта — последняя отметка до начала периода;
 * если её нет, берём первую отметку внутри и считаем от неё. Числа до первой
 * отметки не выдумываем, поэтому прирост «с нуля» не рисуется.
 */
export function subsGain(feed, from, to) {
  const before = subsNow(feed, from > '0000-01-01' ? prevDay(from) : from);
  const end = subsNow(feed, to);
  if (end == null) return 0;
  if (before != null) return Math.max(0, end - before);
  const inside = feed
    ? subsMarks().filter(x => x[feed] != null && x.date >= from && x.date <= to).map(x => x[feed])
    : subsMarks().filter(x => x.date >= from && x.date <= to)
      .map(x => BLOG_FEEDS.map(f => subsLastOf(f.key, x.date)).filter(v => v != null).reduce((a, b) => a + b, 0));
  if (inside.length < 2) return 0;
  return Math.max(0, inside[inside.length - 1] - inside[0]);
}
const prevDay = d => addDays(d, -1);

/** Просмотры: сумма по вышедшим за отрезок и лучший пост за всё время. */
export const viewsSum = (from, to, place = '') =>
  blogOutIn(from, to, place).reduce((a, p) => a + (p.views || 0), 0);
export const viewsRecordValue = () => viewsRecord()?.views || 0;

export const blogFormats = () => S.blog?.formats || [];
export const blogRubrics = () => S.blog?.rubrics || [];
export const rubricName = id => blogRubrics().find(r => r.id === id)?.name || '';
export const formatName = id => blogFormats().find(f => f.id === id)?.name || '';

/**
 * Раскладка по рубрикам: сколько вышло и когда в последний раз. Это описание
 * того, что есть, а не план: доли ни к чему не обязывают, а «давно не было» —
 * такой же факт, как дата, и не упрёк.
 */
export function rubricMix(days = 365) {
  const from = addDays(todayISO(), -days);
  const out = blogOut().filter(p => p.day && p.day >= from);
  return blogRubrics().map(r => {
    const mine = out.filter(p => (p.rubrics || []).includes(r.id));
    return { ...r, n: mine.length, share: out.length ? Math.round((mine.length / out.length) * 100) : 0,
      last: mine.map(p => p.day).sort().slice(-1)[0] || '' };
  }).sort((a, b) => b.n - a.n);
}
export const rubricUnsorted = () => blogOut().filter(p => !(p.rubrics || []).length).length;

/** Форматы за месяц — чтобы видеть, чем на самом деле выходит. */
export function formatMix(ym) {
  const out = blogOutIn(`${ym}-01`, `${ym}-31`);
  return blogFormats().map(f => ({ ...f, n: out.filter(p => p.format === f.id).length }))
    .filter(f => f.n).sort((a, b) => b.n - a.n);
}

/** Готовность черновика по структуре. Без пунктов — не 0%, а «нет структуры». */
export function blockProgress(post) {
  const bs = post?.blocks || [];
  if (!bs.length) return null;
  return Math.round((bs.filter(x => x.done).length / bs.length) * 100);
}

export const mindMonth = ym => mindDays(`${ym}-01`, `${ym}-31`);
export const mindMonthMinutes = ym => mindMinutes(`${ym}-01`, `${ym}-31`);
export const mindStreakWeek = date => weekDates(date).filter(d => mindIn(d, d).length).length;

/**
 * Сдвиг «до → после» по практике: среднее по тем записям, где отмечено и то,
 * и другое. Без обещаний: это среднее твоих же отметок, а не эффект практики.
 */
export function mindShift(key = null, n = 30) {
  const list = (S.mind || [])
    .filter(x => (key === null || x.key === key) && x.before != null && x.after != null)
    .slice(-n);
  if (!list.length) return null;
  const avg = f => Math.round(list.reduce((a, x) => a + f(x), 0) / list.length);
  return { n: list.length, before: avg(x => x.before), after: avg(x => x.after),
    delta: avg(x => x.after - x.before) };
}

// ── сроки на день ───────────────────────────────────────────────
// Сюда попадают только задания учёбы. Работа на «Дне» не показывается
// намеренно: рабочие задачи не должны маячить в личном дне и отвлекать —
// у них своё место, экран «Работа», и там же тихое напоминание на сегодня.
//
// Запись остаётся там, где заведена: день её только показывает и отмечает.

/** Что назначено на этот день из учёбы. */
export function dueOn(date) {
  const t = todayISO();
  const out = [];

  // Задание, которое уже стоит квестом на этот день, в «Сроках» не повторяем:
  // одна и та же работа не должна встречаться на экране дважды.
  const asQuest = new Set(questsOn(date).map(q => q.studyId).filter(Boolean));

  liveTasks().forEach(x => {
    if (!x.due || asQuest.has(x.id)) return;
    const done = x.stage === 'done';
    const overdue = !done && date === t && x.due < t;
    if (x.due !== date && !overdue) return;
    out.push({
      kind: 'study', id: x.id, title: x.title, due: x.due, done, overdue,
      sub: taskSubject(x).name, tag: 'учёба',
    });
  });

  return out.sort((a, b) => (a.done === b.done ? a.due.localeCompare(b.due) : a.done ? 1 : -1));
}
