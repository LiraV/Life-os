// Производные значения. Ничего не хранят — считают из состояния,
// чтобы прогресс, потребности и реплики Летописца шли из реальных данных.

import { S, SPHERES, level, levelFloor } from './store.js';
import { todayISO, addDays, weekDates, weekKey, monthDates, diffDays, dayShort } from './dates.js';

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

// ── цели и сферы ────────────────────────────────────────────────
export function goalProgress(goal) {
  const steps = goal.steps || [];
  if (steps.length) return Math.round((steps.filter(s => s.done).length / steps.length) * 100);
  return Math.max(0, Math.min(100, goal.progress || 0));
}

export const goalsOfMonth = ym => S.goals.filter(g => !g.archived && g.month === ym);

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
export const habitWeek = (habit, date) => weekDates(date).map(d => !!habit.log[d]);
export const habitMonthCount = (habit, ym) => monthDates(ym).filter(d => habit.log[d]).length;

// ── тело ────────────────────────────────────────────────────────
const PHASES = [
  { until: 5,  name: 'менструация', hint: 'мягкие дни — тяжёлое лучше отложить' },
  { until: 12, name: 'фолликулярная', hint: 'сил прибавляется, хорошо начинать новое' },
  { until: 16, name: 'овуляция', hint: 'пик — самое время для сложного' },
  { until: 99, name: 'лютеиновая', hint: 'перед циклом — сама предложу мягкие дни' },
];

export function cycleInfo() {
  const starts = [...S.health.periods].sort();
  if (!starts.length) return null;
  const last = starts[starts.length - 1];
  const day = diffDays(todayISO(), last) + 1;
  if (day < 1) return null;
  // Средняя длина по последним циклам, пока данных мало — 28 дней.
  const gaps = starts.slice(1).map((d, i) => diffDays(d, starts[i])).filter(g => g > 15 && g < 60);
  const len = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 28;
  const phase = PHASES.find(p => day <= p.until);
  return { day, len, phase: phase.name, hint: phase.hint, pct: Math.min(100, Math.round((day / len) * 100)), last };
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
  const hs = S.habits.filter(h => nameMatch.test(h.name));
  if (!hs.length) return null;
  const hits = days.filter(d => hs.some(h => h.log[d])).length;
  return Math.round((hits / days.length) * 100);
}

function questRate(sphereKeys, days, per) {
  const n = days.reduce((acc, d) => acc + questsOn(d).filter(q => q.done && sphereKeys.includes(q.sphere)).length, 0);
  return Math.min(100, Math.round((n / per) * 100));
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
    { key: 'move', name: 'Движение', value: questRate(['sport'], days, 3) || habitRate(/растяж|зал|бег|йог/i, days), hint: 'спорт-квесты за неделю' },
    { key: 'food', name: 'Еда', value: questRate(['food'], days, 3) || habitRate(/вод|еда|завтрак|белок/i, days), hint: 'питание за неделю' },
    { key: 'create', name: 'Творчество', value: questRate(['blog', 'edu'], days, 4), hint: 'блог и обучение за неделю' },
  ];
}

const ROLES = [
  { name: 'Учёная', keys: ['edu'] },
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
