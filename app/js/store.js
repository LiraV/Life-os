// Состояние приложения: одна структура в localStorage, версионированная,
// с экспортом/импортом. Мутации идут только через update() — он сохраняет и
// оповещает подписчиков.

import { todayISO, monthKey, yearOf } from './dates.js';

const KEY = 'lifeos.state';
const VERSION = 35;

/** Роль сферы по умолчанию. Дальше живёт в состоянии и правится руками. */
export const ROLE_SEED = {
  edu: 'scholar', study: 'scholar', books: 'reader', sport: 'athlete',
  food: 'healer', blog: 'artist', work: 'master', money: 'keeper', trips: 'wanderer',
};

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

/** Пустая запись сферы: по ящику на каждую механику. Одна фабрика на всё
 *  приложение — иначе новая механика забывается в одном из мест создания. */
export const blankSphere = () => ({ items: [], note: '', vault: null, log: {}, shelf: [], coll: [], board: [], meas: [] });

/** Все сферы: встроенные из кода плюс свои из состояния. Архивные не в счёт. */
export const allSpheres = () => [...SPHERES, ...(S.customSpheres || []).filter(sp => !sp.archived)];
/** Те, что показываем плитками: скрытые остаются в данных, но не мозолят глаза. */
export const visibleSpheres = () => allSpheres().filter(sp => !(S.spheresHidden || []).includes(sp.key));
export const isCustomSphere = key => (S.customSpheres || []).some(sp => sp.key === key);
/** Механики сферы: у встроенных они зашиты, у своих выбираются при создании. */
export const sphereKinds = key => (S.customSpheres || []).find(sp => sp.key === key)?.kinds || [];

/** Канбан работы. «На проверке» — про согласование, без него доска врёт:
 *  сделанное и ждущее ответа — разные состояния. */
export const WORK_STAGES = [
  { key: 'queue', name: 'Очередь' },
  { key: 'doing', name: 'В работе' },
  { key: 'review', name: 'На проверке' },
  { key: 'done', name: 'Готово' },
];

/** Виды найма. Фриланса и своего дела тут нет намеренно: сфера про наём,
 *  а остальное станет отдельными сферами со своей механикой. */
export const WORK_KINDS = [
  { key: 'job', name: 'Наём' },
  { key: 'part', name: 'Подработка' },
  { key: 'intern', name: 'Стажировка' },
];

/** График по умолчанию у нового места. Правится в самом месте. */
export const blankSched = () => ({ days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00', lunch: 60 });

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
      sex: 'f',                                          // 'f' | 'm' — род обращения и нормы тела
      cycle: true,                                       // вести ли цикл: отдельный тумблер, а не следствие пола
      birth: '',                                         // дата рождения — нужна для расхода калорий и пульса
      height: 0,                                         // рост, см — без него нет ИМТ
      wrist: 0,                                          // обхват запястья, см — тип сложения по Соловьёву
    },
    quests: {},          // { 'YYYY-MM-DD': [quest] }
    inbox: [],           // входящее без даты: { id, text, note, sphere, createdAt }
                         // ничего отсюда не уходит само — переносит человек
    work: {              // сфера «Работа»: наём. Мест работы может быть несколько,
                         // и у каждого свой график, оклад, норма офиса и отпуск.
      jobs: [],          // { id, company, title, kind, start, end, salary, note,
                         //   sched: { days: [], start, end, lunch }, officeNorm, vacationDays }
                         // без end — значит, работаю там сейчас
      days: {},          // { 'YYYY-MM-DD': { <id места>: { type, hours, where, note } } }
                         // type: 'work' | 'vacation' | 'sick' | 'off'; where: 'office' | 'home'
      projects: [],      // { id, name, jobId, archived } — задача может быть и без проекта
      tasks: [],         // { id, title, projectId, jobId, stage, stageAt, due, note, createdAt }
      wins: [],          // опыт и победы: { id, date, title, note, jobId }
    },
    energy: {},          // { 'YYYY-MM-DD': 0..100 }
    goals: [],           // цели: { horizon, period, slots: [], parentId, steps }
    intentions: {},      // { '2026' | '2026-Q3' | '2026-08': [{ id, text }] } — направления, не задачи
    tracker: { rows: [], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {}, tagValues: {} },  // свои строки и ручные правки
    weeks: {},           // { '2026-W34': { boss, steps[], rest } }
    years: {},           // { 2026: { theme, quarters: {Q1..Q4} } }
    spheres: {},         // { key: { items, note, log, shelf, coll, board, meas } }
                         // у каждой механики свой ящик — они не мешают друг другу
    customSpheres: [],   // свои сферы: { key: 'c…', name, icon, mech, kinds: [], unit, dir, archived }
                         // kinds — механики: 'steps' этапы · 'log' журнал · 'shelf' полка
                         //         'coll' коллекция · 'board' доска стадий · 'meas' замеры
    spheresHidden: [],   // ключи сфер, убранных с глаз: данные остаются, плитки нет
    roleOf: {},          // { ключ сферы: id роли } — к какой роли она относится
    habits: [],          // [{ id, name, target, step, unit, log: { date: количество }, link }]
                         // link: '' — своя запись, 'water' — число берётся из «Питания»
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
      updatedAt: '',                                     // когда бюджет заполняли в последний раз
    },
    food: {                                              // дневник питания: КБЖУ и вода по дням
      targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 },
      days: {},                                          // { 'YYYY-MM-DD': { water, entries: [] } }
    },
    mind: [],            // осознанность: { id, date, key, minutes, before, after, note }
                         // before/after — своя отметка напряжения 0..100, обе необязательны
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
  // v27 → v28: пол и мерки. Приложение всё время говорило в женском роде, поэтому
  // старым данным ставим 'f' — это сохраняет то, что человек уже видел, а не
  // навязывает новое. Цикл включён отдельным тумблером: пол задаёт ему значение
  // по умолчанию, но не управляет им дальше, и отметки не пропадают в любом случае.
  merged.user.sex = merged.user.sex === 'm' ? 'm' : 'f';
  merged.user.cycle = typeof merged.user.cycle === 'boolean' ? merged.user.cycle : merged.user.sex === 'f';
  merged.user.birth = typeof merged.user.birth === 'string' ? merged.user.birth : '';
  merged.user.height = Number(merged.user.height) || 0;
  merged.user.wrist = Number(merged.user.wrist) || 0;
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

  // Списка «по умолчанию» больше нет. Раньше сюда высыпался чужой личный
  // список на 31 дело вместе с кличкой питомца — всем одинаково. Теперь
  // «Забота» предлагает подходящее по профилю, а человек отмечает, что берёт:
  // каталог лежит в carelib.js, выбор — на экране заботы. Уже заведённые дела
  // не трогаем: у тех, кто пользовался прежней версией, список остаётся как был.

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
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : '',
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

  // v34 → v35: осознанность. Журнал практик: что делала, сколько минут и
  // как было до и после. Отметки «до/после» необязательны — практика без них
  // всё равно записывается, а выводы человек делает сам.
  merged.mind = (Array.isArray(merged.mind) ? merged.mind : []).map(x => ({
    id: x.id || uid(), date: x.date || todayISO(), key: x.key || 'quiet',
    minutes: Math.max(0, Number(x.minutes) || 0),
    before: x.before == null ? null : Number(x.before),
    after: x.after == null ? null : Number(x.after),
    note: x.note || '',
  })).filter(x => x.minutes >= 0 && x.key);

  // v33 → v34: мест работы стало несколько. Раньше график, оклад и норма
  // офиса были одни на человека, а отметка дня не знала, к какому месту она
  // относится, — со вторым наймом это перестало быть правдой.
  //
  // Перенос: должности из «Пути» и есть места работы, к ним добавляется
  // график. Если отметки дней уже были, а места ни одного, заводим одно —
  // названное общим словом «Работа», а не выдуманной компанией: имя человек
  // впишет сам, а терять отмеченные дни нельзя.
  const w = merged.work && typeof merged.work === 'object' ? merged.work : {};
  const oldJob = w.job && typeof w.job === 'object' ? w.job : null;
  const oldSched = () => ({
    days: Array.isArray(oldJob?.days) ? oldJob.days : blankSched().days,
    start: oldJob?.start || blankSched().start,
    end: oldJob?.end || blankSched().end,
    lunch: Number(oldJob?.lunch) >= 0 ? Number(oldJob.lunch) : 60,
  });

  let jobs = Array.isArray(w.jobs) ? w.jobs : null;
  if (!jobs) {
    // Должности прошлой версии становятся местами работы.
    jobs = (Array.isArray(w.career) ? w.career : []).map(x => ({
      id: x.id, company: x.company || '', title: x.title || '', kind: x.kind || 'job',
      start: x.start, end: x.end || '', salary: Math.max(0, Number(x.salary) || 0),
      note: x.note || '', sched: oldSched(),
      officeNorm: Math.max(0, Number(oldJob?.officeNorm) || 0),
      vacationDays: Number(oldJob?.vacationDays) >= 0 ? Number(oldJob.vacationDays) : 28,
    }));
  }
  const dayRecords = w.days && typeof w.days === 'object' ? w.days : {};
  const flatDays = Object.values(dayRecords).some(r => r && typeof r.type === 'string');
  if (flatDays && !jobs.length) {
    jobs = [{
      id: uid(), company: 'Работа', title: '', kind: 'job',
      start: Object.keys(dayRecords).sort()[0] || todayISO(), end: '',
      salary: Math.max(0, Number(oldJob?.salary) || 0), note: '', sched: oldSched(),
      officeNorm: Math.max(0, Number(oldJob?.officeNorm) || 0),
      vacationDays: Number(oldJob?.vacationDays) >= 0 ? Number(oldJob.vacationDays) : 28,
    }];
  }
  const mainJob = jobs.find(j => !j.end)?.id || jobs[0]?.id || '';

  merged.work = {
    jobs: jobs.map(j => ({
      ...j, kind: WORK_KINDS.some(k => k.key === j.kind) ? j.kind : 'job',
      sched: { ...blankSched(), ...(j.sched && typeof j.sched === 'object' ? j.sched : {}) },
      salary: Math.max(0, Number(j.salary) || 0),
      officeNorm: Math.max(0, Number(j.officeNorm) || 0),
      vacationDays: Number(j.vacationDays) >= 0 ? Number(j.vacationDays) : 28,
    })),
    // Плоская отметка дня переезжает под место работы, а не пропадает.
    days: Object.fromEntries(Object.entries(dayRecords).map(([d, r]) => [d,
      (r && typeof r.type === 'string')
        ? { [mainJob]: { type: r.type, hours: Number(r.hours) || 0, where: r.where === 'home' ? 'home' : 'office', note: r.note || '' } }
        : (r && typeof r === 'object' ? r : {})]).filter(([, r]) => Object.keys(r).length)),
    projects: (Array.isArray(w.projects) ? w.projects : []).map(x => ({ ...x, jobId: x.jobId || mainJob })),
    tasks: (Array.isArray(w.tasks) ? w.tasks : []).map(t => ({
      ...t, projectId: t.projectId || '', jobId: t.jobId || mainJob,
      stage: WORK_STAGES.some(x => x.key === t.stage) ? t.stage : 'queue',
    })),
    wins: (Array.isArray(w.wins) ? w.wins : []).map(x => ({ ...x, jobId: x.jobId || mainJob })),
  };

  // v30 → v31: инбокс. Место, куда мысль кладут, не решая сразу, когда её делать:
  // без даты, без сферы, без обязательств. В планер она уходит только руками.
  merged.inbox = (Array.isArray(merged.inbox) ? merged.inbox : []).map(x => ({
    id: x.id || uid(), text: String(x.text || '').trim(),
    note: x.note || '', sphere: x.sphere || '', createdAt: x.createdAt || todayISO(),
  })).filter(x => x.text);

  // v28 → v29: свои сферы. Набор сфер перестал быть константой: встроенные
  // лежат в коде, свои — в состоянии. Роли остаются набором в коде, но какая
  // сфера к какой роли относится — уже данные, и это можно менять.
  const sph = merged.spheres && typeof merged.spheres === 'object' ? merged.spheres : {};
  const arr = x => (Array.isArray(x) ? x : []);
  merged.spheres = Object.fromEntries(Object.entries(sph).map(([k, r]) => [k, {
    ...blankSphere(),
    items: arr(r?.items),
    note: r?.note || '',
    vault: r?.vault ?? null,
    log: r?.log && typeof r.log === 'object' ? r.log : {},
    shelf: arr(r?.shelf), coll: arr(r?.coll), board: arr(r?.board), meas: arr(r?.meas),
  }]));
  merged.customSpheres = (Array.isArray(merged.customSpheres) ? merged.customSpheres : []).map(sp => ({
    key: sp.key, name: sp.name || 'Сфера', icon: sp.icon || '✦', mech: sp.mech || 'своя',
    kinds: Array.isArray(sp.kinds) && sp.kinds.length ? sp.kinds : ['steps'],
    unit: sp.unit || 'раз', dir: sp.dir === 'down' ? 'down' : sp.dir === 'up' ? 'up' : 'none',
    archived: !!sp.archived,
  })).filter(sp => typeof sp.key === 'string' && sp.key.startsWith('c'));
  merged.spheresHidden = (Array.isArray(merged.spheresHidden) ? merged.spheresHidden : []).filter(x => typeof x === 'string');
  merged.roleOf = merged.roleOf && typeof merged.roleOf === 'object' ? merged.roleOf : {};
  // Раскладка по ролям была зашита в код — теперь это данные. Заполняем только
  // незаданное: «??=» не трогает уже выбранное, включая пустое «без роли»,
  // поэтому снятая привязка не восстановится при следующей загрузке.
  Object.entries(ROLE_SEED).forEach(([sphere, role]) => { merged.roleOf[sphere] ??= role; });

  // v27 → v28: вода как привычка и вода в «Питании» были двумя числами про одно.
  // Привычку про воду связываем с «Питанием»; её журнал не трогаем — он остаётся
  // в хранилище и вернётся, если связь снять. Прошлые значения переносим только
  // когда они и правда в миллилитрах (норма от 100) и день в «Питании» пуст:
  // отметку-галочку «вода: да» в миллилитры не превратить, не выдумав их.
  merged.habits = (Array.isArray(merged.habits) ? merged.habits : []).map(hb => {
    const link = typeof hb.link === 'string' ? hb.link
      // Границу слова пишем явно: \b в JS работает по латинице и с кириллицей
      // не совпадает ни с чем — на этом связь и не срабатывала.
      : /(^|[^\p{L}])вод[аыу]/iu.test(hb.name || '') ? 'water' : '';
    return { ...hb, link };
  });
  // Переезд делается один раз и запоминается флагом. Без него он повторялся бы
  // при каждой загрузке — и день, у которого воду обнулили руками, восстанавливался
  // бы из журнала привычки: удалить запись было бы невозможно.
  merged.habits.filter(hb => hb.link === 'water' && !hb.waterMoved).forEach(hb => {
    if (Number(hb.target) >= 100) {
      Object.keys(hb.log || {}).forEach(d => {
        const day = (merged.food.days[d] ||= { water: 0, entries: [] });
        if (!day.water) day.water = Math.max(0, Number(hb.log[d]) || 0);
      });
    }
    hb.waterMoved = true;
  });

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

/** Отметка времени у бюджета: когда его в последний раз заполняли. */
export function touchBudget(s) {
  s.budget.updatedAt = new Date().toISOString();
}

/** Вода живёт в «Питании». Привычка со связью читает и пишет туда же —
 *  два числа не синхронизируются, потому что число одно. */
export const isWater = hb => hb?.link === 'water';
export const waterOf = (s, date) => Math.max(0, Number(s.food.days[date]?.water) || 0);
export const waterNorm = s => Math.max(1, Number(s.food.targets.water) || 1);

export function tickHabit(s, id, date) {
  const hb = s.habits.find(x => x.id === id);
  if (!hb) return null;
  const target = isWater(hb) ? waterNorm(s) : habitNorm(hb);
  const was = isWater(hb) ? waterOf(s, date) : Math.max(0, Number(hb.log[date]) || 0);
  const next = was >= target ? 0 : Math.min(target, was + habitStep(hb));
  if (isWater(hb)) (s.food.days[date] ||= { water: 0, entries: [] }).water = next;
  else if (next) hb.log[date] = next; else delete hb.log[date];
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
