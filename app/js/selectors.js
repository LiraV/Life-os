// Производные значения. Ничего не хранят — считают из состояния,
// чтобы прогресс, потребности и реплики Летописца шли из реальных данных.

import { S, SPHERES, level, levelFloor } from './store.js';
import { todayISO, addDays, weekDates, weekKey, monthDates, diffDays, dayShort, quarterMonths } from './dates.js';

export const questsOn = date => S.quests[date] || [];
export const sphereOf = key => SPHERES.find(s => s.key === key);

/** Кривая энергии по хронотипу: 6 блоков от утра к ночи. */
export const ENERGY_BLOCKS = ['7–10', '10–13', '13–16', '16–19', '19–22', '22–01'];
const CURVES = {
  'сова':       [22, 40, 46, 62, 95, 78],
  'жаворонок':  [82, 95, 72, 54, 38, 18],
  'плавает':    [48, 70, 64, 72, 62, 36],
};
export const energyCurve = () => CURVES[S.user.chronotype] || CURVES['плавает'];
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

// ── обучение: курсы и практики ──────────────────────────────────
export const liveLessons = () => S.lessons.filter(l => !l.archived);
export const practices = () => liveLessons().filter(l => l.kind === 'practice');

export const lessonDates = l => Object.keys(l.log || {}).filter(d => l.log[d]).sort();
export const lessonMonth = (l, ym) => lessonDates(l).filter(d => d.startsWith(ym)).length;
export const lessonLast = l => lessonDates(l).filter(d => d <= todayISO()).pop() || null;
/** Сколько дней назад было последнее занятие; null — если ни одного. */
export const lessonAgo = l => { const d = lessonLast(l); return d ? diffDays(todayISO(), d) : null; };

export const courseProgress = l => {
  const items = l.items || [];
  if (!items.length) return null;
  return Math.round((items.filter(i => i.done).length / items.length) * 100);
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

// ── потребности и роли ──────────────────────────────────────────
const lastDays = n => Array.from({ length: n }, (_, i) => addDays(todayISO(), -i));

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

/** Движение — это и спорт-квесты, и занятия с галочкой «считать в спорте». */
function moveRate(days) {
  const n = days.reduce((acc, d) => acc + questsOn(d).filter(q => q.done && q.sphere === 'sport').length, 0)
    + sportLessonSessions(days);
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

const ROLES = [
  { name: 'Учёная', keys: ['edu', 'study'] },
  { name: 'Атлет', keys: ['sport'] },
  { name: 'Артистка', keys: ['blog'] },
  { name: 'Хранительница', keys: ['money', 'food'] },
];

/** Роль «скучает», если по её сферам две недели ничего не закрыто. */
export function roles() {
  const days = lastDays(14);
  return ROLES.map(r => {
    const n = days.reduce((acc, d) => acc + questsOn(d).filter(q => q.done && r.keys.includes(q.sphere)).length, 0);
    const state = n === 0 ? 'скучает' : n < 3 ? 'ровно' : 'довольна';
    return { ...r, n, state, low: n === 0 };
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

  if (!qs.length) out.push(date === t ? 'На сегодня пусто. Добавим одно дело — этого достаточно.' : `На ${dayShort(date)} пока пусто.`);
  if (!out.length) out.push(`Всё идёт ровно. Пик энергии сегодня в ${peakLabel()}.`);
  return out;
}
