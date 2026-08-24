// Состояние приложения: одна структура в localStorage, версионированная,
// с экспортом/импортом. Мутации идут только через update() — он сохраняет и
// оповещает подписчиков.

import { todayISO, monthKey, yearOf } from './dates.js';

const KEY = 'lifeos.state';
const VERSION = 10;

export const SPHERES = [
  { key: 'edu',   name: 'Обучение', mech: 'древо',      img: 'assets/illustration_09.png' },
  { key: 'study', name: 'Учёба',    mech: 'курсы',      img: 'assets/illustration_03.png' },
  { key: 'work',  name: 'Работа',   mech: 'квесты',     img: 'assets/illustration_02.png' },
  { key: 'blog',  name: 'Блог',     mech: 'ферма идей', img: 'assets/illustration_06.png' },
  { key: 'sport', name: 'Спорт',    mech: 'статы',      img: 'assets/illustration_05.png' },
  { key: 'food',  name: 'Питание',  mech: 'зелья',      img: 'assets/illustration_04.png' },
  { key: 'money', name: 'Бюджет',   mech: 'казна',      img: 'assets/illustration_10.png' },
];

export const XP = { quest: 10, boss: 40, habit: 3, step: 15, measure: 5, reflection: 8, test: 25 };

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function blank() {
  const t = todayISO();
  return {
    v: VERSION,
    onboarded: false,
    user: {
      name: '', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55,
      traits: [], xp: 0, createdAt: t,
    },
    quests: {},          // { 'YYYY-MM-DD': [quest] }
    energy: {},          // { 'YYYY-MM-DD': 0..100 }
    goals: [],           // цели: { horizon, period, slots: [], parentId, steps }
    intentions: {},      // { '2026' | '2026-Q3' | '2026-08': [{ id, text }] } — направления, не задачи
    tracker: { rows: [], values: {}, habitValues: {} },  // свои строки трекера и ручные правки: { привычка: { месяц: полных дней } }
    weeks: {},           // { '2026-W34': { boss, steps[], rest } }
    years: {},           // { 2026: { theme, quarters: {Q1..Q4} } }
    spheres: {},         // { key: { items: [], note } }
    habits: [],          // [{ id, name, target, step, unit, log: { date: количество } }]
    health: { days: {}, measures: [], symptoms: [] },   // days: { 'YYYY-MM-DD': true } — отмеченные дни месячных
    lessons: [],                                         // полка обучения: курсы и практики
    budget: {                                            // бюджет: статьи, план по месяцам, операции, копилки
      cats: { expense: [], income: [] },
      plans: {},                                         // { 'YYYY-MM': { expense: { id: сумма }, income: {...} } }
      ops: [],                                           // { id, date, kind: 'expense'|'income'|'save', catId, vaultId, sum, note }
      vaults: [],                                        // { id, name, start }
      rules: [],
      start: 0,                                          // баланс, с которого начинается учёт
    },
    food: {                                              // дневник питания: КБЖУ и вода по дням
      targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 },
      days: {},                                          // { 'YYYY-MM-DD': { water, entries: [] } }
    },
    diary: [],
    chat: [],
    tests: {},
    ui: { tab: 'day', date: t, weekAnchor: t, monthAnchor: monthKey(t), year: yearOf(t), habitAnchor: t },
  };
}

function migrate(s) {
  const base = blank();
  const merged = { ...base, ...s, v: VERSION };
  merged.user = { ...base.user, ...(s.user || {}) };
  merged.health = { ...base.health, ...(s.health || {}) };
  merged.ui = { ...base.ui, ...(s.ui || {}) };

  // v1 → v2: раньше хранились только даты начала цикла. Переносим их
  // в отмеченные дни как есть — придумывать длительность за пользователя нельзя.
  if (Array.isArray(merged.health.periods)) {
    merged.health.days ||= {};
  merged.intentions ||= {};

  // Полка обучения: у курса уроки, у практики журнал занятий по датам.
  merged.lessons = (Array.isArray(merged.lessons) ? merged.lessons : []).map(l => ({
    ...l,
    kind: l.kind === 'course' ? 'course' : 'practice',
    perMonth: Math.max(0, Number(l.perMonth) || 0),
    cost: Math.max(0, Number(l.cost) || 0),
    alsoSport: !!l.alsoSport,
    paused: !!l.paused,
    log: l.log && typeof l.log === 'object' ? l.log : {},
    items: Array.isArray(l.items) ? l.items : [],
  }));

  const b = merged.budget && typeof merged.budget === 'object' ? merged.budget : {};
  merged.budget = {
    cats: {
      expense: Array.isArray(b.cats?.expense) ? b.cats.expense : [],
      income: Array.isArray(b.cats?.income) ? b.cats.income : [],
    },
    plans: b.plans && typeof b.plans === 'object' ? b.plans : {},
    ops: Array.isArray(b.ops) ? b.ops : [],
    vaults: Array.isArray(b.vaults) ? b.vaults : [],
    rules: Array.isArray(b.rules) ? b.rules : [],
    start: Number(b.start) || 0,
  };

  // Первый запуск бюджета: заводим статьи и правила, чтобы не начинать с пустоты.
  if (!merged.budget.cats.expense.length && !merged.budget.ops.length) {
    const mk = name => ({ id: uid(), name });
    merged.budget.cats.expense = ['Здоровье', 'Буся', 'Подписки', 'Обучение', 'Спорт', 'Жильё', 'Еда', 'Транспорт', 'Одежда', 'Другое'].map(mk);
    merged.budget.cats.income = ['От отца', 'Подработка', 'Фриланс', 'Моё дело', 'Работа', 'Льготы'].map(mk);
    merged.budget.vaults = ['Накопительный', 'Сейв 1', 'Сейв 2'].map(n => ({ ...mk(n), start: 0 }));
    merged.budget.rules = [
      'Никакой Лавки', 'По максимуму общественный транспорт', 'Живу красиво только на выходных',
      'За неделю планировать, сколько тратить в какой день', 'Каждый день класть себе фиксированную сумму',
      'Не брать в долг', 'Никакого такси',
    ];
    // Прежняя «казна» из сферы «Бюджет» переезжает в копилку, чтобы не потерять сумму.
    const old = merged.spheres?.money?.vault;
    if (old && Number(old.saved) > 0) {
      merged.budget.vaults.unshift({ id: uid(), name: old.title || 'Копилка', start: Number(old.saved) || 0 });
    }
  }

  const food = merged.food && typeof merged.food === 'object' ? merged.food : {};
  merged.food = {
    targets: { ...base.food.targets, ...(food.targets || {}) },
    days: food.days && typeof food.days === 'object' ? food.days : {},
  };

  // v4 → v5: привычка была «отмечено / нет», стала «сколько раз за день»
  // при дневной норме. Старая отметка равна одному разу при норме один.
  // v5 → v6: у привычки появился шаг — сколько добавляет один тап.
  // Для «вода 2000 мл» это 250, для «таблетки 3 раза» — один.
  merged.habits = (merged.habits || []).map(hb => ({
    ...hb,
    target: Number(hb.target) > 0 ? Number(hb.target) : 1,
    step: Number(hb.step) > 0 ? Number(hb.step) : 1,
    unit: hb.unit || '',
    log: Object.fromEntries(
      Object.entries(hb.log || {})
        .map(([d, v]) => [d, v === true ? 1 : Math.max(0, Math.round(Number(v) || 0))])
        .filter(([, v]) => v > 0),
    ),
  }));
    const moved = merged.health.periods.filter(d => typeof d === 'string');
    moved.forEach(d => { merged.health.days[d] = true; });
    delete merged.health.periods;
    // Длительность в старом формате не хранилась — честно скажем об этом на экране.
    if (moved.length) merged.health.startsOnlyNotice = true;
  }
  merged.health.days ||= {};
  merged.intentions ||= {};

  // Полка обучения: у курса уроки, у практики журнал занятий по датам.
  merged.lessons = (Array.isArray(merged.lessons) ? merged.lessons : []).map(l => ({
    ...l,
    kind: l.kind === 'course' ? 'course' : 'practice',
    perMonth: Math.max(0, Number(l.perMonth) || 0),
    cost: Math.max(0, Number(l.cost) || 0),
    alsoSport: !!l.alsoSport,
    paused: !!l.paused,
    log: l.log && typeof l.log === 'object' ? l.log : {},
    items: Array.isArray(l.items) ? l.items : [],
  }));

  const b = merged.budget && typeof merged.budget === 'object' ? merged.budget : {};
  merged.budget = {
    cats: {
      expense: Array.isArray(b.cats?.expense) ? b.cats.expense : [],
      income: Array.isArray(b.cats?.income) ? b.cats.income : [],
    },
    plans: b.plans && typeof b.plans === 'object' ? b.plans : {},
    ops: Array.isArray(b.ops) ? b.ops : [],
    vaults: Array.isArray(b.vaults) ? b.vaults : [],
    rules: Array.isArray(b.rules) ? b.rules : [],
    start: Number(b.start) || 0,
  };

  // Первый запуск бюджета: заводим статьи и правила, чтобы не начинать с пустоты.
  if (!merged.budget.cats.expense.length && !merged.budget.ops.length) {
    const mk = name => ({ id: uid(), name });
    merged.budget.cats.expense = ['Здоровье', 'Буся', 'Подписки', 'Обучение', 'Спорт', 'Жильё', 'Еда', 'Транспорт', 'Одежда', 'Другое'].map(mk);
    merged.budget.cats.income = ['От отца', 'Подработка', 'Фриланс', 'Моё дело', 'Работа', 'Льготы'].map(mk);
    merged.budget.vaults = ['Накопительный', 'Сейв 1', 'Сейв 2'].map(n => ({ ...mk(n), start: 0 }));
    merged.budget.rules = [
      'Никакой Лавки', 'По максимуму общественный транспорт', 'Живу красиво только на выходных',
      'За неделю планировать, сколько тратить в какой день', 'Каждый день класть себе фиксированную сумму',
      'Не брать в долг', 'Никакого такси',
    ];
    // Прежняя «казна» из сферы «Бюджет» переезжает в копилку, чтобы не потерять сумму.
    const old = merged.spheres?.money?.vault;
    if (old && Number(old.saved) > 0) {
      merged.budget.vaults.unshift({ id: uid(), name: old.title || 'Копилка', start: Number(old.saved) || 0 });
    }
  }

  const food = merged.food && typeof merged.food === 'object' ? merged.food : {};
  merged.food = {
    targets: { ...base.food.targets, ...(food.targets || {}) },
    days: food.days && typeof food.days === 'object' ? food.days : {},
  };

  // v4 → v5: привычка была «отмечено / нет», стала «сколько раз за день»
  // при дневной норме. Старая отметка равна одному разу при норме один.
  // v5 → v6: у привычки появился шаг — сколько добавляет один тап.
  // Для «вода 2000 мл» это 250, для «таблетки 3 раза» — один.
  merged.habits = (merged.habits || []).map(hb => ({
    ...hb,
    target: Number(hb.target) > 0 ? Number(hb.target) : 1,
    step: Number(hb.step) > 0 ? Number(hb.step) : 1,
    unit: hb.unit || '',
    log: Object.fromEntries(
      Object.entries(hb.log || {})
        .map(([d, v]) => [d, v === true ? 1 : Math.max(0, Math.round(Number(v) || 0))])
        .filter(([, v]) => v > 0),
    ),
  }));

  // v2 → v3: раньше цель была только месячной и хранила поле month.
  // Переводим на горизонты, чтобы рядом жили цели квартала и года.
  merged.goals = (merged.goals || []).map(g => {
    const base = g.horizon ? g
      : { ...g, horizon: 'month', period: g.month || monthKey(todayISO()), parentId: g.parentId || '', month: undefined };
    // v3 → v4: слоты — периоды, в которые цель положена помимо своего горизонта.
    return { ...base, slots: Array.isArray(base.slots) ? base.slots : [] };
  });

  const tr = merged.tracker && typeof merged.tracker === 'object' ? merged.tracker : {};
  merged.tracker = {
    rows: Array.isArray(tr.rows) ? tr.rows : [],
    values: tr.values && typeof tr.values === 'object' ? tr.values : {},
    habitValues: tr.habitValues && typeof tr.habitValues === 'object' ? tr.habitValues : {},
  };

  // v6 → v7: трекер считает только полные дни, поэтому ручная правка стала
  // одним числом вместо пары «сколько раз / полных дней». Записанное в разах
  // переводим по норме — 45 приёмов при норме 3 это 15 полных дней.
  Object.values(merged.tracker.habitValues).forEach((byMonth, i) => {
    const hid = Object.keys(merged.tracker.habitValues)[i];
    const target = Math.max(1, Number((merged.habits.find(x => x.id === hid) || {}).target) || 1);
    Object.entries(byMonth).forEach(([ym, val]) => {
      if (typeof val === 'number') return;
      const days = val && typeof val === 'object'
        ? (typeof val.days === 'number' ? val.days
          : typeof val.total === 'number' ? Math.round(val.total / target) : null)
        : null;
      if (days == null) delete byMonth[ym];
      else byMonth[ym] = Math.max(0, Math.min(31, days));
    });
  });

  return merged;
}

// Ставится в load(), если на диске лежит не текущий формат — тогда после
// запуска сразу перезаписываем, чтобы старый формат не уехал в экспорт.
let needsRewrite = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    // Через migrate проходит и чистое состояние: там же заводятся статьи бюджета.
    if (!raw) { needsRewrite = true; return migrate(blank()); }
    const parsed = JSON.parse(raw);
    if (parsed.v !== VERSION) needsRewrite = true;
    return migrate(parsed);
  } catch (e) {
    console.warn('[lifeos] не удалось прочитать сохранение, начинаем заново', e);
    needsRewrite = true;
    return migrate(blank());
  }
}

export const S = load();

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      console.error('[lifeos] сохранение не удалось', e);
    }
  }, 120);
}

if (needsRewrite) save();

/**
 * Сохранить, не перерисовывая экран. Нужно там, где перерисовка сломала бы
 * жест: ползунок пересоздался бы прямо под пальцем.
 */
export function updateQuiet(mutator) {
  mutator(S);
  save();
}

/** Единственный способ менять состояние: мутируем внутри, дальше — сохранение и перерисовка. */
export function update(mutator) {
  mutator(S);
  save();
  listeners.forEach(fn => fn());
}

export function addXp(n) { S.user.xp = Math.max(0, S.user.xp + n); }

export const habitStep = hb => Math.max(1, Number(hb?.step) || 1);
export const habitNorm = hb => Math.max(1, Number(hb?.target) || 1);

/**
 * Один тап по привычке: добавляет шаг, а на закрытой норме обнуляет день.
 * Живёт в хранилище, чтобы главный экран и экран «Ритм» считали одинаково.
 * Опыт начисляется за закрытую норму, а не за каждый тап.
 */
/** Пометить, что данные трекера трогали: подпись «последнее обновление» берётся отсюда. */
export function touchTracker(s) {
  s.tracker.updatedAt = new Date().toISOString();
}

export function tickHabit(s, id, date) {
  const hb = s.habits.find(x => x.id === id);
  if (!hb) return null;
  const target = habitNorm(hb);
  const was = Math.max(0, Number(hb.log[date]) || 0);
  const next = was >= target ? 0 : Math.min(target, was + habitStep(hb));
  if (next) hb.log[date] = next; else delete hb.log[date];
  if (next >= target && was < target) addXp(XP.habit);
  if (was >= target && next < target) addXp(-XP.habit);
  touchTracker(s);
  return { name: hb.name, was, next, target, reached: next >= target && was < target };
}

export const level = xp => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
export const levelFloor = lv => Math.round(60 * (lv - 1) ** 2);

/** Записать в дневник — сюда стекаются рефлексии, тесты и события сфер. */
export function addDiary(s, text, when, source = 'auto') {
  s.diary.unshift({ id: uid(), date: todayISO(), when, text, source });
  s.diary = s.diary.slice(0, 400);
}

export function exportJSON() {
  return JSON.stringify({ ...S, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.user) throw new Error('Это не файл «Жизни в одном месте»');
  const next = migrate(parsed);
  update(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, next); });
}

export function resetAll() {
  update(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, blank()); });
}
