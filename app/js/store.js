// Состояние приложения: одна структура в localStorage, версионированная,
// с экспортом/импортом. Мутации идут только через update() — он сохраняет и
// оповещает подписчиков.

import { todayISO, monthKey, yearOf } from './dates.js';

const KEY = 'lifeos.state';
const VERSION = 27;

export const SPHERES = [
  { key: 'edu',   name: 'Обучение', mech: 'древо',      img: 'assets/illustration_09.png' },
  { key: 'study', name: 'Учёба',    mech: 'курсы',      img: 'assets/illustration_03.png' },
  { key: 'work',  name: 'Работа',   mech: 'квесты',     img: 'assets/illustration_02.png' },
  { key: 'blog',  name: 'Блог',     mech: 'ферма идей', img: 'assets/illustration_06.png' },
  { key: 'sport', name: 'Спорт',    mech: 'статы',      img: 'assets/illustration_05.png' },
  { key: 'food',  name: 'Питание',  mech: 'зелья',      img: 'assets/illustration_04.png' },
  { key: 'money', name: 'Бюджет',   mech: 'казна',      img: 'assets/illustration_10.png' },
  { key: 'books', name: 'Библиотека', mech: 'полка',    img: 'assets/illustration_07.png' },
  { key: 'trips', name: 'Страны',   mech: 'карта',      img: 'assets/illustration_01.png' },
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
      avatar: '',                                        // 'a1'…'a5' из assets/avatars или пусто — буква имени
    },
    quests: {},          // { 'YYYY-MM-DD': [quest] }
    energy: {},          // { 'YYYY-MM-DD': 0..100 }
    goals: [],           // цели: { horizon, period, slots: [], parentId, steps }
    intentions: {},      // { '2026' | '2026-Q3' | '2026-08': [{ id, text }] } — направления, не задачи
    tracker: { rows: [], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {}, tagValues: {} },  // свои строки и ручные правки
    weeks: {},           // { '2026-W34': { boss, steps[], rest } }
    years: {},           // { 2026: { theme, quarters: {Q1..Q4} } }
    spheres: {},         // { key: { items: [], note } }
    habits: [],          // [{ id, name, target, step, unit, log: { date: количество } }]
    health: { days: {}, measures: [], symptoms: [] },   // days: { 'YYYY-MM-DD': true } — отмеченные дни месячных
    lessons: [],                                         // полка обучения: курсы и практики
    sport: {                                             // спорт: тренировки и упражнения с рекордами
      workouts: [],                                      // { id, date, title, templateId, lessonId, goalId, done, sets: [], tags: [], note }
                                                         // подход: { id, exerciseId, value, reps, done }
      exercises: [],                                     // { id, name, unit, dir: 'up'|'down'|'both' }
      templates: [],                                     // шаблоны тренировок: { id, name, sets: [], tags: [] } — без дат
      tags: [],                                          // пилюли: { id, name } — пресс, руки, зал с тренером
    },
    schedules: [],                                       // расписание — дело по дням недели:
                                                         // { id, kind, refId, days: [], time, dur, every, from, to, place, note, off,
                                                         //   moves: { 'дата по правилу': 'новая дата' | '' — отменено } }
    travel: {                                            // страны: где была и когда
      visits: [],                                        // { id, code, year, note }
    },
    library: {                                           // библиотека: полка книг
      books: [],                                         // { id, title, author, kind, pages, page, status, rating, started, finished, note }
    },
    care: {                                              // забота: повторяющиеся дела с периодичностью
      items: [],                                         // { id, name, group, every, anchor, last, log: [], cost, note, link }
      pet: { name: '', kind: '', birth: '', note: '', weights: [] },  // weights: [{ id, date, kg }]
    },
    study: {                                             // учёба: заведения → предметы → этапы
      places: [],                                        // { id, name, note }
      subjects: [],                                      // { id, placeId, name, teacher, from, to, grade, archived }
      tasks: [],                                         // { id, subjectId, title, stage, stageAt, due, note }
      attend: {},                                        // посещения по расписанию: { предмет: { дата: 1 } }
    },
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
    // tips: 'ask' — предложение ещё не показывали, 'on' — показываем, 'off' — отказалась
    ui: { tab: 'day', date: t, weekAnchor: t, monthAnchor: monthKey(t), year: yearOf(t), habitAnchor: t,
          tips: 'ask', tipsSeen: {} },
  };
}

function migrate(s) {
  const base = blank();
  const merged = { ...base, ...s, v: VERSION };
  merged.user = { ...base.user, ...(s.user || {}) };
  // v22 → v23: аватар профиля. Пусто — рисуем букву имени, как раньше.
  merged.user.avatar = typeof merged.user.avatar === 'string' ? merged.user.avatar : '';
  merged.health = { ...base.health, ...(s.health || {}) };
  merged.ui = { ...base.ui, ...(s.ui || {}) };
  // v21 → v22: подсказки на экранах. 'ask' — предложение ещё не показывали;
  // оно приходит после онбординга, а тем, кто уже пользуется, — при запуске.
  if (!['ask', 'on', 'off'].includes(merged.ui.tips)) merged.ui.tips = 'ask';
  merged.ui.tipsSeen = merged.ui.tipsSeen && typeof merged.ui.tipsSeen === 'object' ? merged.ui.tipsSeen : {};
  // Разговор мог оборваться на середине запроса — «думаю…» не должно залипать.
  merged.ui.chatBusy = false;

  // v1 → v2: раньше хранились только даты начала цикла. Переносим их
  // в отмеченные дни как есть — придумывать длительность за пользователя нельзя.
  if (Array.isArray(merged.health.periods)) {
    merged.health.days ||= {};
    const moved = merged.health.periods.filter(d => typeof d === 'string');
    moved.forEach(d => { merged.health.days[d] = true; });
    delete merged.health.periods;
    // Длительность в старом формате не хранилась — честно скажем об этом на экране.
    if (moved.length) merged.health.startsOnlyNotice = true;
  }
  merged.health.days ||= {};

  merged.intentions ||= {};

  // v10 → v11: черты стали идентификаторами с эффектами, а не подписями.
  const OLD_TRAITS = {
    'Сова': 'owl', 'Жаворонок': 'lark', 'Плавающий ритм': 'floating',
    'Спринтер': 'sprinter', 'Марафонец': 'marathoner',
    'Нужна тишина': 'quiet', 'Заряжаюсь от людей': 'social',
    'Эстет достижений ✦': 'aesthete', 'Эстет достижений': 'aesthete',
    'Исследовательница': 'explorer', 'Соревновательница': 'racer',
    'Хранительница смысла': 'keeper',
  };
  merged.user.traits = [...new Set((merged.user.traits || [])
    .map(t => (typeof t === 'string' && OLD_TRAITS[t]) ? OLD_TRAITS[t] : t)
    .filter(t => typeof t === 'string' && /^[a-z]+$/.test(t)))];

  const sp = merged.sport && typeof merged.sport === 'object' ? merged.sport : {};
  // v16 → v17: виды тренировок стали шаблонами без дат, а сами тренировки
  // живут только на своих днях. Названия и наборы упражнений переносим.
  const oldKinds = Array.isArray(sp.kinds) ? sp.kinds : [];
  const templates = Array.isArray(sp.templates) && sp.templates.length
    ? sp.templates
    : oldKinds.filter(k => k.sets?.length || !['gym', 'coach', 'dance', 'stretch', 'cardio', 'other'].includes(k.id))
        .map(k => ({ id: k.id, name: k.name, sets: Array.isArray(k.sets) ? k.sets : [] }));
  const kindName = id => (oldKinds.find(k => k.id === id) || {}).name || '';

  merged.sport = {
    workouts: (Array.isArray(sp.workouts) ? sp.workouts : []).map(w => ({
      ...w,
      title: (w.title || '').trim() || kindName(w.kind) || 'Тренировка',
      templateId: w.templateId || (templates.some(t => t.id === w.kind) ? w.kind : ''),
      sets: (Array.isArray(w.sets) ? w.sets : []).map(x => ({ ...x, done: typeof x.done === 'boolean' ? x.done : !!w.done })),
      // v23 → v24: пилюли тренировки — «пресс», «руки», «зал с тренером».
      tags: Array.isArray(w.tags) ? w.tags : [],
      kind: undefined,
    })),
    exercises: (Array.isArray(sp.exercises) ? sp.exercises : []).map(e => ({ ...e, dir: ['up', 'down', 'both'].includes(e.dir) ? e.dir : 'up' })),
    templates: templates.map(t => ({ ...t, sets: Array.isArray(t.sets) ? t.sets : [], tags: Array.isArray(t.tags) ? t.tags : [] })),
    tags: (Array.isArray(sp.tags) ? sp.tags : []).map(t => ({ id: t.id, name: t.name })),
  };

  // Заготовку «Растяжка» переименовали в «Шпагат»: у неё та же роль, но так
  // понятнее, что именно отмечается. Свои названия не трогаем.
  merged.sport.tags.forEach(t => { if (t.name === 'Растяжка') t.name = 'Шпагат'; });

  // Первый запуск: несколько привычных пилюль, чтобы было с чего начать.
  if (!merged.sport.tags.length && !merged.sport.workouts.some(w => w.tags?.length)) {
    merged.sport.tags = ['Пресс', 'Руки', 'Ягодицы', 'Ноги', 'Спина', 'Кардио', 'Шпагат', 'Зал с тренером']
      .map(name => ({ id: uid(), name }));
  }

  // Автоматическое закрытие целей убрано: цели отмечаются вручную,
  // связь с тренировкой осталась только подписью.
  merged.goals = merged.goals.map(g => ({ ...g, exerciseId: undefined }));
  // Первый запуск: заводим упражнения, которые уже считались в таблице.
  if (!merged.sport.exercises.length && !merged.sport.workouts.length) {
    merged.sport.exercises = [
      { id: uid(), name: 'Планка', unit: 'сек', dir: 'up' },
      { id: uid(), name: 'Турник', unit: 'раз', dir: 'up' },
      { id: uid(), name: 'Пресс', unit: 'раз', dir: 'up' },
      // У шпагата меньше — лучше: это расстояние до пола, а не достижение.
      { id: uid(), name: 'Шпагат', unit: 'см до пола', dir: 'down' },
    ];
  }

  // v18 → v19: забота — повторяющиеся дела с периодичностью и профиль питомца.
  // v26 → v27: страны. Одна поездка — одна запись, поэтому в одну страну
  // можно съездить хоть трижды, а «за жизнь» всё равно считается по разу.
  const tv = merged.travel && typeof merged.travel === 'object' ? merged.travel : {};
  merged.travel = {
    visits: (Array.isArray(tv.visits) ? tv.visits : []).map(v => ({
      id: v.id, code: String(v.code || '').toUpperCase(),
      year: Number(v.year) || yearOf(todayISO()), note: v.note || '',
    })).filter(v => v.code),
  };

  // v25 → v26: библиотека — книги со статусом и прогрессом по страницам.
  const lib = merged.library && typeof merged.library === 'object' ? merged.library : {};
  merged.library = {
    books: (Array.isArray(lib.books) ? lib.books : []).map(b => ({
      ...b,
      kind: ['paper', 'ebook', 'audio'].includes(b.kind) ? b.kind : 'paper',
      status: ['want', 'reading', 'done', 'dropped'].includes(b.status) ? b.status : 'want',
      pages: Math.max(0, Number(b.pages) || 0),
      page: Math.max(0, Number(b.page) || 0),
      rating: Math.min(5, Math.max(0, Number(b.rating) || 0)),
    })),
  };

  const cr = merged.care && typeof merged.care === 'object' ? merged.care : {};
  merged.care = {
    items: (Array.isArray(cr.items) ? cr.items : []).map(it => ({
      ...it,
      group: ['health', 'beauty', 'home', 'pet'].includes(it.group) ? it.group : 'health',
      every: Math.max(1, Number(it.every) || 1),
      anchor: Number(it.anchor) >= 1 && Number(it.anchor) <= 12 ? Number(it.anchor) : 0,
      last: it.last || '',
      log: Array.isArray(it.log) ? it.log : [],
      cost: Math.max(0, Number(it.cost) || 0),
    })),
    pet: { ...base.care.pet, ...(cr.pet && typeof cr.pet === 'object' ? cr.pet : {}),
      weights: Array.isArray(cr.pet?.weights) ? cr.pet.weights : [] },
  };

  // Первый запуск: список из «Системы поддержки» — периодичность выведена
  // из месяцев, а «когда в последний раз» остаётся пустым: за неё не придумываем.
  if (!merged.care.items.length) {
    const SEED = [
      ['Маникюр', 'beauty', 1, 1], ['Педикюр', 'beauty', 1, 1],
      ['Психиатр', 'health', 3, 1], ['Эпиляция', 'beauty', 3, 2],
      ['Замеры тела', 'health', 3, 2], ['Кровь на литий', 'health', 3, 3],
      ['Массаж', 'health', 3, 3], ['Расхламление подписок', 'home', 6, 2],
      ['Чистка лица', 'beauty', 6, 4], ['Расхламление одежды', 'home', 6, 5],
      ['Расхламление телефона', 'home', 6, 6], ['Бусик от глистов', 'pet', 6, 3],
      ['ТО машины', 'home', 12, 1], ['Проверка документов', 'home', 12, 1],
      ['Общий анализ мочи', 'health', 12, 1], ['Терапевт', 'health', 12, 2],
      ['ЭКГ + УЗИ сердца', 'health', 12, 3], ['Гинеколог', 'health', 12, 4],
      ['Таблетки от глистов', 'health', 12, 4], ['Мануальный терапевт', 'health', 12, 5],
      ['Парикмахер', 'beauty', 12, 6], ['Чек-ап Бусика', 'pet', 12, 8],
      ['Химчистка', 'home', 12, 9], ['Починка одежды', 'home', 12, 9],
      ['Общий анализ крови', 'health', 12, 9], ['Проф гигиена', 'health', 12, 9],
      ['Вакцина Бусику', 'pet', 12, 10], ['Кровь на железо', 'health', 12, 10],
      ['Кровь на D3', 'health', 12, 11], ['Страховка на машину', 'home', 12, 12],
      ['Анализ крови биохим', 'health', 12, 12],
    ];
    merged.care.items = SEED.map(([name, group, every, anchor]) => ({
      id: uid(), name, group, every, anchor, last: '', log: [], cost: 0, note: '',
      // Замеры тела уже живут в «Теле»: отметка берётся оттуда, а не дублируется.
      link: name === 'Замеры тела' ? 'measure' : '',
    }));
    if (!merged.care.pet.name) merged.care.pet = { ...merged.care.pet, name: 'Бусик' };
  }

  // v19 → v20: расписание. Событие не хранится по датам — только правило,
  // поэтому расписание можно поменять задним числом и ничего не разъедется.
  merged.schedules = (Array.isArray(merged.schedules) ? merged.schedules : []).map(sc => ({
    ...sc,
    days: (Array.isArray(sc.days) ? sc.days : []).map(Number).filter(d => d >= 0 && d <= 6),
    every: Number(sc.every) === 2 ? 2 : 1,
    dur: Math.max(0, Number(sc.dur) || 0),
    off: !!sc.off,
    // v20 → v21: перенос и отмена одного занятия живут отдельно от правила.
    moves: sc.moves && typeof sc.moves === 'object' ? sc.moves : {},
  }));

  const stu = merged.study && typeof merged.study === 'object' ? merged.study : {};
  merged.study = {
    places: Array.isArray(stu.places) ? stu.places : [],
    subjects: Array.isArray(stu.subjects) ? stu.subjects : [],
    tasks: (Array.isArray(stu.tasks) ? stu.tasks : []).map(t => ({ ...t, stage: t.stage || 'todo' })),
    // Посещения по расписанию: { предмет: { 'YYYY-MM-DD': 1 } }
    attend: stu.attend && typeof stu.attend === 'object' ? stu.attend : {},
  };

  // Полка обучения: у курса уроки, у практики журнал занятий по датам.
  merged.lessons = (Array.isArray(merged.lessons) ? merged.lessons : []).map(l => ({
    ...l,
    kind: l.kind === 'course' ? 'course' : 'practice',
    perMonth: Math.max(0, Number(l.perMonth) || 0),
    cost: Math.max(0, Number(l.cost) || 0),
    alsoSport: !!l.alsoSport,
    paused: !!l.paused,
    log: l.log && typeof l.log === 'object' ? l.log : {},
    // v24 → v25: то, что было уроками курса, стало модулями, а уроки живут
    // внутри модуля. Прежние записи становятся модулями без уроков — отметки целы.
    items: (Array.isArray(l.items) ? l.items : []).map(m => ({
      ...m,
      lessons: (Array.isArray(m.lessons) ? m.lessons : []).map(x => ({ id: x.id, title: x.title, done: !!x.done })),
    })),
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
    lessonValues: tr.lessonValues && typeof tr.lessonValues === 'object' ? tr.lessonValues : {},
    exerciseValues: tr.exerciseValues && typeof tr.exerciseValues === 'object' ? tr.exerciseValues : {},
    // Ручные правки строк-пилюль: { пилюля: { 'YYYY-MM': число } }
    tagValues: tr.tagValues && typeof tr.tagValues === 'object' ? tr.tagValues : {},
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
