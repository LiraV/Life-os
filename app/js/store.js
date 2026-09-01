// Состояние приложения: одна структура в localStorage, версионированная,
// с экспортом/импортом. Мутации идут только через update() — он сохраняет и
// оповещает подписчиков.

import { todayISO, monthKey, yearOf } from './dates.js';
import { KCOLUMNS, KTYPES } from './kanban.js';

const KEY = 'lifeos.state';
// Куда откладывается сырой текст, если его не удалось прочитать: из него
// всё можно вернуть, поэтому он не должен пропасть вместе со сбоем.
const RESCUE = 'lifeos.state.rescue';
// Снимок последнего состояния перед сменой формата. Нужен на случай, когда
// миграция не падает, а тихо теряет часть данных: тогда упасть некуда, и
// вернуться можно только отсюда.
const PREV = 'lifeos.state.prev';
const VERSION = 54;

/** Роль сферы по умолчанию. Дальше живёт в состоянии и правится руками. */
export const ROLE_SEED = {
  edu: 'scholar', study: 'scholar', books: 'reader', sport: 'athlete',
  food: 'healer', health: 'healer', blog: 'artist', biz: 'artist', work: 'master', free: 'master',
  money: 'keeper', trips: 'wanderer',
};

import { artSrc } from './sphereart.js';
import { BLOG_STAGES, BLOG_PLACES, DEFAULT_FORMATS } from './blog.js';
import { FREE_STAGES, FREE_KINDS } from './free.js';
import { BIZ_STAGES, BIZ_KIND_KEYS } from './biz.js';
import { REVIEW_Q, REVIEW_OPEN } from './review.js';

// screen — собственный экран сферы. Он же отвечает за подсветку меню:
// экраны сфер живут под «Сферами», и знать об этом должно одно место.
export const SPHERES = [
  { key: 'edu',   name: 'Обучение', mech: 'древо',      img: 'assets/illustration_09.png', screen: 'edu' },
  { key: 'study', name: 'Учёба',    mech: 'курсы',      img: 'assets/illustration_03.png', screen: 'study' },
  { key: 'work',  name: 'Работа',   mech: 'квесты',     img: 'assets/illustration_02.png', screen: 'work' },
  { key: 'blog',  name: 'Блог',     mech: 'редакция',    img: 'assets/illustration_06.png' },
  { key: 'sport', name: 'Спорт',    mech: 'статы',      img: 'assets/illustration_05.png', screen: 'sport' },
  { key: 'food',  name: 'Питание',  mech: 'зелья',      img: 'assets/illustration_04.png', screen: 'food' },
  // «Тело» — такая же сфера жизни, как остальные, просто со своим экраном:
  // цикл, замеры и сон живут там, а плитка открывает именно его.
  { key: 'health', name: 'Тело',     mech: 'состояние',  img: 'assets/spheres/care.webp', screen: 'health' },
  { key: 'free',  name: 'Фриланс',  mech: 'заказы',     img: 'assets/spheres/plan.webp', screen: 'free' },
  { key: 'biz',   name: 'Моё дело',  mech: 'проекты',    img: 'assets/illustration_08.png', screen: 'biz' },
  { key: 'money', name: 'Бюджет',   mech: 'казна',      img: 'assets/illustration_10.png', screen: 'budget' },
  { key: 'books', name: 'Библиотека', mech: 'полка',    img: 'assets/illustration_07.png', screen: 'library' },
  { key: 'trips', name: 'Страны',   mech: 'карта',      img: 'assets/illustration_01.png', screen: 'trips' },
];

/** Пустая запись сферы: по ящику на каждую механику. Одна фабрика на всё
 *  приложение — иначе новая механика забывается в одном из мест создания. */
export const blankSphere = () => ({ items: [], note: '', vault: null, log: {}, shelf: [], coll: [], board: [], meas: [] });

/** Все сферы: встроенные из кода плюс свои из состояния. Архивные не в счёт. */
/** Своя сфера с готовой обложкой: путь к картинке выводим из ключа, а не
 *  храним в данных — иначе переезд файла разошёлся бы с сохранённым. */
export const withArt = sp => (sp.art ? { ...sp, img: artSrc(sp.art) } : sp);
export const allSpheres = () => [...SPHERES, ...(S.customSpheres || []).filter(sp => !sp.archived).map(withArt)];
/** Те, что показываем плитками: скрытые остаются в данных, но не мозолят глаза. */
export const visibleSpheres = () => allSpheres().filter(sp => !(S.spheresHidden || []).includes(sp.key));
export const isCustomSphere = key => (S.customSpheres || []).some(sp => sp.key === key);
/** Механики сферы: у встроенных они зашиты, у своих выбираются при создании. */
export const sphereKinds = key => (S.customSpheres || []).find(sp => sp.key === key)?.kinds || [];

/** Виды найма. Фриланса и своего дела тут нет намеренно: сфера про наём,
 *  а остальное станет отдельными сферами со своей механикой. */
export const WORK_KINDS = [
  { key: 'job', name: 'Наём' },
  { key: 'part', name: 'Подработка' },
  { key: 'intern', name: 'Стажировка' },
];

/** График по умолчанию у нового места. Правится в самом месте. */
/** Приёмы пищи. Список закрытый: это разделы дня, а не свободные записи —
 *  и по ним же считается привычка «сколько раз ела». */
export const MEALS = [
  { key: 'breakfast', name: 'Завтрак' },
  { key: 'lunch', name: 'Обед' },
  { key: 'dinner', name: 'Ужин' },
  { key: 'snack', name: 'Перекус' },
];

export const blankSched = () => ({ days: [0, 1, 2, 3, 4], start: '09:00', end: '18:00', lunch: 60 });

export const XP = { quest: 10, boss: 40, habit: 3, step: 15, measure: 5, reflection: 8, test: 25 };

/**
 * Проверка на тёзку. Сравниваем без учёта регистра, лишних пробелов и «ё»:
 * «Вода», «вода » и «Приемы» с «Приёмы» — это одно и то же имя, а не два.
 *
 * Заводится не везде. Каталоги — привычки, сферы, места работы, дела заботы,
 * книги, занятия, предметы, упражнения, статьи бюджета — это наборы разных
 * вещей, и тёзка там всегда ошибка. А квесты, блюда, карточки доски и поездки
 * повторяются законно: «овсянка» бывает каждое утро, и мешать этому нельзя.
 */
export const normName = x => String(x || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

/**
 * Кто из списка уже носит это имя. Себя не считаем — правка не тёзка.
 * Опознаём и по id, и по key: у сфер идентификатор называется key, и без
 * этого сфера считала тёзкой саму себя, а править её было нельзя.
 */
export function nameTaken(list, name, selfId = null, key = 'name') {
  const n = normName(name);
  if (!n) return null;
  return (list || []).find(x => x && (x.id ?? x.key) !== selfId && normName(x[key]) === n) || null;
}

// ── отметки энергии ─────────────────────────────────────────────
// Отметка привязана к блоку дня: одно число в сутки не говорит, когда оно
// было, и кривая по нему учиться не может. Живёт здесь, а не в selectors,
// потому что нужно и чертам — иначе получается кольцо импортов.

export const energyRec = date => S.energy[date] || {};
/** Отметка в конкретном блоке этого дня. */
export const energyAt = (date, block) => {
  const v = energyRec(date)[String(block)];
  return v == null ? null : Number(v);
};
/** Значение дня: среднее по его отметкам, включая ночную вне блоков. */
export function energyOn(date) {
  const vals = Object.values(energyRec(date)).map(Number).filter(Number.isFinite);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

/** Блок кривой дня по часам; ночью (1–7) — вне блоков. Живёт в хранилище,
 *  потому что и отметка, и кривая, и подсказки считают его одинаково. */
export function blockAt(hours = new Date().getHours()) {
  // Порядок важен: ночной блок 22–01 переваливает через полночь, и его надо
  // отсечь первым. Иначе час ночи не доходит до своей строки и попадает
  // в «10–13» — просто потому, что 1 меньше 13.
  if (hours >= 22 || hours < 1) return 5;
  if (hours < 7) return -1;   // 01–07: блока нет, это не время дня
  if (hours < 10) return 0;
  if (hours < 13) return 1;
  if (hours < 16) return 2;
  if (hours < 19) return 3;
  return 4;                   // 19–22
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blank() {
  const t = todayISO();
  return {
    v: VERSION,
    onboarded: false,
    user: {
      name: '', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55,
      pace: '',                                          // 'sprint' | 'even' | '' — как берёшься за дела
      wrist: 0,                                          // обхват запястья, см — тип сложения; спрашивается в «Теле»
      traits: [], xp: 0, createdAt: t,
      avatar: '',                                        // 'a1'…'a5' из assets/avatars или пусто — буква имени
      sex: 'f',                                          // 'f' | 'm' — род обращения и нормы тела
      cycle: true,                                       // вести ли цикл: отдельный тумблер, а не следствие пола
      birth: '',                                         // дата рождения — нужна для расхода калорий и пульса
      height: 0,                                         // рост, см — без него нет ИМТ
    },
    quests: {},          // { 'YYYY-MM-DD': [quest] }
                         // квест: { id, title, time, minutes, sphere, boss, done, doneAt,
                         //   goalId — зачем; lessonId — занятие с полки; unitId — конкретный
                         //   урок курса; studyId — задание учёбы; careId — дело из «Заботы» }
    inbox: [],           // входящее без даты: { id, text, note, sphere, createdAt }
                         // ничего отсюда не уходит само — переносит человек
    work: {              // сфера «Работа»: наём. Мест работы может быть несколько,
                         // и у каждого свой график, оклад, норма офиса и отпуск.
      jobs: [],          // { id, company, title, kind, start, end, salary, note,
                         //   sched: { days: [], start, end, lunch }, officeNorm, vacationDays }
                         // без end — значит, работаю там сейчас
      days: {},          // { 'YYYY-MM-DD': { <id места>: { type, hours, where, note } } }
                         // type: 'work' | 'vacation' | 'sick' | 'off'; where: 'office' | 'home'
      tasks: [],         // карточки доски: процесс МП → РК перенесён из отдельного канбана
                         // { id, jobId, column, type, title, platforms: [], month, day, deadline,
                         //   request, budget, split, urgent, links, notes, checklist: [], movedAt }
                         // day — день работы (когда делаю), deadline — срок сдачи
      wins: [],          // опыт и победы: { id, date, title, note, jobId }
    },
    sleep: {},           // { 'YYYY-MM-DD': часы } — ночь, после которой человек
                         // проснулся в этот день; полчаса — минимальный шаг
    energy: {},          // { 'YYYY-MM-DD': { '0'..'5': 0..100, d: 0..100 } }
                         // ключ — блок кривой дня; 'd' — отметка вне блоков (ночью)
    goals: [],           // цели: { horizon, period, slots: [], parentId, intentId, steps }
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
    health: { days: {}, measures: [], symptoms: [], metrics: [] },
                         // days: { 'YYYY-MM-DD': true } — отмеченные дни месячных
                         // metrics: свои мерки [{ id, name, unit }]; значения замера
                         // лежат в его extra по id мерки
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
      tasks: [],                                         // { id, subjectId, title, stage, stageAt, doneAt, due, note }
      attend: {},                                        // посещения по расписанию: { предмет: { дата: 1 } }
    },
    budget: {                                            // бюджет: статьи, план по месяцам, операции, копилки
      cats: { expense: [], income: [] },
      plans: {},                                         // { 'YYYY-MM': { expense: { id: сумма }, income: {...} } }
      ops: [],                                           // { id, date, kind: 'expense'|'income'|'save', catId, vaultId, sum, cur, bulk, note }
      vaults: [],                                        // { id, name, start }
      rules: [],
      start: 0,                                          // баланс, с которого начинается учёт
      updatedAt: '',                                     // когда бюджет заполняли в последний раз
    },
    food: {                                              // дневник питания: КБЖУ и вода по дням
      targets: { kcal: 2000, prot: 90, fat: 70, carb: 220, water: 2000 },
      days: {},                                          // { 'YYYY-MM-DD': { water, entries: [] } }
                                                         // блюдо: { id, meal, title, kcal, prot, fat, carb, time, source }
    },
    mind: [],            // осознанность: { id, date, key, minutes, before, after, note }
    review: {},          // недельный анализ: { '2026-W35': { date, scores: {}, open: {} } }
    biz: {               // моё дело: своё — от продукта до комьюнити и организации
      projects: [],      // { id, name, kind, stage, link, launched, note,
                         //   steps: [{id,text,done}], metrics: [{id,name,unit}],
                         //   marks: [{id,metricId,date,value}] }
    },
    free: {              // фриланс: заказы, площадки, услуги и шаги выхода
      orders: [],        // { id, title, placeId, kind, price, cur, fee, stage, due, paidAt, link, note, movedAt }
      places: [],        // площадки: { id, name, fee } — комиссия в процентах
      services: [],      // что продаю: { id, name, price }
      steps: [],         // путь на фриланс: { id, text, done }
    },
    blog: {              // блог: конвейер постов и отметки подписчиков
      posts: [],         // { id, title, place, stage, day, format, rubrics: [], blocks: [], seed, link, views, note }
      subs: [],          // { id, date, ig, tg } — сколько было на эту дату
      formats: [],       // свой список форматов: [{ id, name }]
      rubrics: [],       // рубрикатор: [{ id, name, note }]
    },
                         // before/after — своя отметка напряжения 0..100, обе необязательны
    deleted: [],         // следы удалённых записей: { id, from, at } — чтобы удалённое не вернулось
    touched: {},         // когда трогали ежедневную отметку: путь → время; у них нет своего места для времени
    changedAt: '',       // когда это состояние вообще меняли — грубая отметка для того, у чего своего времени нет
    diary: [],
    chat: [],
    tests: {},
    // tips: 'ask' — предложение ещё не показывали, 'on' — показываем, 'off' — отказалась
    ui: { tab: 'day', date: t, weekAnchor: t, monthAnchor: monthKey(t), year: yearOf(t), habitAnchor: t,
          tips: 'ask', tipsSeen: {}, icon: 'pearl', theme: 'dawn', unpack: 0 },
  };
}


/**
 * Имя для заготовки — одинаковое на всех устройствах. Заготовки (пилюли,
 * статьи бюджета, копилки, форматы блога) заводились со случайными именами на
 * каждом устройстве отдельно, и первая же синхронизация честно решала, что
 * «Пресс» с телефона и «Пресс» с ноутбука — две разные пилюли. Имя, выведенное
 * из названия, делает их одной и той же вещью где угодно.
 *
 * Только для заготовок: у того, что человек завёл сам, имя случайное и живёт
 * своей жизнью — переименование не должно менять личность записи.
 */
function seedId(kind, name) {
  const s = `${kind}:${normName(name)}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `s${(h >>> 0).toString(36)}${s.length.toString(36)}`;
}

/** Заготовки по разделам: имя каталога → названия, которые мы сеем сами. */
const SEEDS = {
  tag: ['Пресс', 'Руки', 'Ягодицы', 'Ноги', 'Спина', 'Кардио', 'Шпагат', 'Зал с тренером'],
  exercise: ['Планка', 'Турник', 'Пресс', 'Шпагат'],
  expense: ['Здоровье', 'Буся', 'Подписки', 'Обучение', 'Спорт', 'Жильё', 'Еда', 'Транспорт', 'Одежда', 'Другое'],
  income: ['От отца', 'Подработка', 'Фриланс', 'Моё дело', 'Работа', 'Льготы'],
  vault: ['Накопительный', 'Сейв 1', 'Сейв 2'],
};

/**
 * Привести каталог в порядок: заготовкам вернуть общее имя, тёзок схлопнуть в
 * одну запись, а все ссылки на убранные перевести на оставшуюся. Ссылку терять
 * нельзя: без неё тренировка забудет свою пилюлю, а операция — свою статью.
 */
function collapseTwins(list, kind, moved) {
  if (!Array.isArray(list)) return list;
  const known = new Set((SEEDS[kind] || []).map(normName));
  const byName = new Map();
  const out = [];
  for (const rec of list) {
    if (!rec || typeof rec !== 'object') continue;
    const key = normName(rec.name || rec.text || '');
    if (!key) { out.push(rec); continue; }
    const want = known.has(key) ? seedId(kind, key) : null;
    if (want && rec.id !== want) { moved.set(rec.id, want); rec.id = want; }
    const twin = byName.get(key);
    if (twin) { moved.set(rec.id, twin.id); continue; }
    byName.set(key, rec);
    out.push(rec);
  }
  return out;
}

/** Перевести ссылки: любое строковое значение, равное убранному имени. */
function remapIds(node, moved, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const to = moved.get(v);
      if (to && k !== 'id') node[k] = to;
    } else if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] === 'string' && moved.has(v[i])) v[i] = moved.get(v[i]);
        else remapIds(v[i], moved, depth + 1);
      }
    } else if (v && typeof v === 'object') {
      remapIds(v, moved, depth + 1);
      // Ящики, где имя записи стоит ключом: значения трекера, отметки привычек.
      for (const key of Object.keys(v)) {
        const to = moved.get(key);
        if (to && to !== key) { v[to] = { ...(v[to] || {}), ...v[key] }; delete v[key]; }
      }
    }
  }
}

/**
 * Списки приводим к спискам, ящики — к ящикам, по образцу пустого состояния.
 * Если в сохранении на месте списка оказалось что-то другое, дальше его
 * перебирают десятки блоков, и любой из них падает. Падение ловится, данные
 * целы и человек видит экран спасения — но отправлять туда всё сохранение
 * из-за одной кривой ветки незачем, когда её достаточно починить.
 *
 * Образец берётся из blank(), а не списком имён: новая ветка попадает под
 * защиту сама, без того чтобы кто-то вспомнил дописать её сюда.
 */
function fixShape(node, sample) {
  for (const [k, v] of Object.entries(sample)) {
    if (Array.isArray(v)) {
      if (!Array.isArray(node[k])) node[k] = [];
    } else if (v && typeof v === 'object') {
      if (!node[k] || typeof node[k] !== 'object' || Array.isArray(node[k])) {
        node[k] = JSON.parse(JSON.stringify(v));
      } else {
        fixShape(node[k], v);
      }
    }
  }
}

/**
 * Приведение сохранения к нынешнему виду. Экспортируется ради проверок: это
 * единственная функция, которая переписывает данные человека, и её вывод
 * сверяется с эталоном при каждой правке.
 */
export function migrate(s) {
  const base = blank();
  const merged = { ...base, ...s, v: VERSION };
  merged.user = { ...base.user, ...(s.user || {}) };
  fixShape(merged, base);
  // v22 → v23: аватар профиля. Пусто — рисуем букву имени, как раньше.
  merged.user.avatar = typeof merged.user.avatar === 'string' ? merged.user.avatar : '';
  merged.user.wrist = Number(merged.user.wrist) || 0;
  // v44 → v45: кроме веса, талии и бёдер человек меряет что хочет. Готовых
  // мерок не навязываем — список пустой, пока сама не добавит.
  merged.health.metrics = (Array.isArray(merged.health.metrics) ? merged.health.metrics : [])
    .filter(m => m && m.name).map(m => ({ id: m.id || uid(), name: String(m.name).trim(), unit: String(m.unit || 'см').trim() }));
  merged.health.measures = (Array.isArray(merged.health.measures) ? merged.health.measures : []).map(r => ({
    ...r,
    extra: r.extra && typeof r.extra === 'object'
      ? Object.fromEntries(Object.entries(r.extra).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v)))
      : {},
  }));
  // v42 → v43: темп перестал выводиться из ползунка «Активность» — тот про
  // движение, а не про то, рывками ты работаешь или ровно. Прежним данным
  // ставим то, что человек уже видел на полке черт, а не пустоту. Делаем это
  // ровно один раз, по номеру пришедшей версии: иначе выбранное «по-разному»
  // при каждой загрузке снова превращалось бы в вывод из ползунка.
  const fromV = Number(s?.v) || 0;
  merged.user.pace = ['sprint', 'even'].includes(merged.user.pace) ? merged.user.pace
    : (fromV && fromV < 43 ? (Number(merged.user.activity) > 60 ? 'sprint' : 'even') : '');
  // v27 → v28: пол и мерки. Приложение всё время говорило в женском роде, поэтому
  // старым данным ставим 'f' — это сохраняет то, что человек уже видел, а не
  // навязывает новое. Цикл включён отдельным тумблером: пол задаёт ему значение
  // по умолчанию, но не управляет им дальше, и отметки не пропадают в любом случае.
  merged.user.sex = merged.user.sex === 'm' ? 'm' : 'f';
  merged.user.cycle = typeof merged.user.cycle === 'boolean' ? merged.user.cycle : merged.user.sex === 'f';
  merged.user.birth = typeof merged.user.birth === 'string' ? merged.user.birth : '';
  merged.user.height = Number(merged.user.height) || 0;
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
      // Час необязательный: тренировка без него — это «когда-нибудь сегодня».
      time: /^\d{2}:\d{2}$/.test(String(w.time || '')) ? w.time : '',
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
  // понятнее, что именно отмечается.
  //
  // Это разовая правка на переходе, а не постоянное правило. Пока она шла при
  // каждой загрузке, она ловила и пилюлю, которую человек завёл сам: та
  // становилась вторым «Шпагатом» и тут же схлопывалась с первым, потому что
  // тёзок каталог сводит в одну запись. Со стороны — «добавляю „Растяжку“, а
  // она сразу исчезает», причём не сразу, а через пару секунд: состояние
  // проходит через миграцию на синхронизации. По id старые данные не отличить
  // (там у заготовки был произвольный id), поэтому отличаем по версии: всё,
  // что сохранено до этой сборки, правим один раз, дальше — руки прочь.
  if (fromV < 54) merged.sport.tags.forEach(t => { if (t.name === 'Растяжка') t.name = 'Шпагат'; });

  // Первый запуск: несколько привычных пилюль, чтобы было с чего начать.
  if (!merged.sport.tags.length && !merged.sport.workouts.some(w => w.tags?.length)) {
    merged.sport.tags = SEEDS.tag.map(name => ({ id: seedId('tag', name), name }));
  }

  // Автоматическое закрытие целей убрано: цели отмечаются вручную,
  // связь с тренировкой осталась только подписью.
  merged.goals = merged.goals.map(g => ({ ...g, exerciseId: undefined }));
  // Первый запуск: заводим упражнения, которые уже считались в таблице.
  if (!merged.sport.exercises.length && !merged.sport.workouts.length) {
    merged.sport.exercises = [
      { name: 'Планка', unit: 'сек', dir: 'up' },
      { name: 'Турник', unit: 'раз', dir: 'up' },
      { name: 'Пресс', unit: 'раз', dir: 'up' },
      // У шпагата меньше — лучше: это расстояние до пола, а не достижение.
      { name: 'Шпагат', unit: 'см до пола', dir: 'down' },
    ].map(e => ({ id: seedId('exercise', e.name), ...e }));
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
    // Разовое занятие: один день вместо правила по дням недели.
    date: typeof sc.date === 'string' ? sc.date.slice(0, 10) : '',
    // v20 → v21: перенос и отмена одного занятия живут отдельно от правила.
    moves: sc.moves && typeof sc.moves === 'object' ? sc.moves : {},
  }));

  const stu = merged.study && typeof merged.study === 'object' ? merged.study : {};
  merged.study = {
    places: Array.isArray(stu.places) ? stu.places : [],
    subjects: Array.isArray(stu.subjects) ? stu.subjects : [],
    // doneAt старым заданиям не выдумываем: когда их сдали, мы не знаем, и
    // подставить «сегодня» значило бы записать неправду в счёт целей.
    tasks: (Array.isArray(stu.tasks) ? stu.tasks : [])
      .map(t => ({ ...t, stage: t.stage || 'todo', doneAt: typeof t.doneAt === 'string' ? t.doneAt : '' })),
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
    // bulk — «итог за месяц»: одна запись вместо расписанного месяца. Помечена,
    // чтобы её можно было заменить, а не удвоить, и показать иначе в списке.
    ops: (Array.isArray(b.ops) ? b.ops : []).map(o => ({ ...o, bulk: !!o.bulk })),
    vaults: Array.isArray(b.vaults) ? b.vaults : [],
    // Правило — такая же запись, как остальные: со своим id. Раньше это были
    // просто строки, и удалялись они по номеру в списке — единственное место,
    // где запись адресовалась не собой.
    rules: (Array.isArray(b.rules) ? b.rules : [])
      .map(r => (typeof r === 'string' ? { id: uid(), text: r } : r))
      .filter(r => r && typeof r === 'object' && String(r.text || '').trim())
      .map(r => ({ ...r, id: r.id || uid(), text: String(r.text).trim() })),
    start: Number(b.start) || 0,
    updatedAt: typeof b.updatedAt === 'string' ? b.updatedAt : '',
  };

  // Первый запуск бюджета: заводим статьи и правила, чтобы не начинать с пустоты.
  if (!merged.budget.cats.expense.length && !merged.budget.ops.length) {
    // Имена заготовок выводим из названий: см. seedId — иначе на двух
    // устройствах заведутся разные «Еда» и «Спорт», и синхронизация покажет обе.
    const mk = kind => name => ({ id: seedId(kind, name), name });
    merged.budget.cats.expense = SEEDS.expense.map(mk('expense'));
    merged.budget.cats.income = SEEDS.income.map(mk('income'));
    merged.budget.vaults = SEEDS.vault.map(n => ({ ...mk('vault')(n), start: 0 }));
    merged.budget.rules = [
      'Никакой Лавки', 'По максимуму общественный транспорт', 'Живу красиво только на выходных',
      'За неделю планировать, сколько тратить в какой день', 'Каждый день класть себе фиксированную сумму',
      'Не брать в долг', 'Никакого такси',
    ].map(text => ({ id: seedId('rule', text), text }));
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

  // v41 → v42: сон отмечается за каждую ночь. Где не отмечено — там нет
  // ключа, а не ноль. Ноль при этом законная отметка: бессонная ночь бывает,
  // и выбрасывать её было бы потерей данных.
  merged.sleep = Object.fromEntries(Object.entries(merged.sleep || {})
    .map(([d, v]) => [d, Math.round(Math.max(0, Math.min(24, Number(v))) * 2) / 2])
    .filter(([, v]) => Number.isFinite(v)));

  // v37 → v38: отметка энергии привязывается к блоку дня, а не только к дате —
  // иначе кривая не может учиться: одно число в сутки не говорит, когда оно было.
  // Старым отметкам время не придумываем: они ложатся под 'd' — считаются
  // средним за день, но кривую не формируют.
  merged.energy = Object.fromEntries(Object.entries(merged.energy || {}).map(([d, v]) => {
    if (typeof v === 'number') return [d, { d: Math.max(0, Math.min(100, v)) }];
    if (!v || typeof v !== 'object') return [d, {}];
    const out = {};
    Object.entries(v).forEach(([k, n]) => {
      const num = Math.max(0, Math.min(100, Number(n)));
      if (Number.isFinite(num) && (k === 'd' || (Number(k) >= 0 && Number(k) <= 5))) out[k] = num;
    });
    return [d, out];
  }));

  // v36 → v37: день питания делится на приёмы пищи. Уже записанным блюдам
  // приём не придумываем: они попадают в «Без приёма», и разложить их можно
  // руками — угадывать, что было завтраком, а что ужином, нельзя.
  Object.values(merged.food.days).forEach(d => {
    (d.entries || []).forEach(e => { e.meal = MEALS.some(m => m.key === e.meal) ? e.meal : ''; });
  });

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
    // v35 → v36: доска стала настоящим процессом — четыре общие стадии
    // заменены колонками канбана. Старые задачи переезжают в «прочие»: они
    // и были прочими, придумывать им место в цепочке РК было бы неправдой.
    tasks: (Array.isArray(w.tasks) ? w.tasks : []).map(t => {
      const col = KCOLUMNS.some(c => c.id === t.column) ? t.column
        : ({ queue: 'ot-todo', doing: 'ot-progress', review: 'ot-progress', done: 'ot-done' }[t.stage] || 'ot-todo');
      return {
        id: t.id, jobId: t.jobId || mainJob, column: col,
        type: KTYPES.includes(t.type) ? t.type : 'Прочее',
        title: t.title || '', platforms: Array.isArray(t.platforms) ? t.platforms : [],
        month: t.month || '', day: t.day || t.due || '', deadline: t.deadline || '',
        request: t.request || '', budget: t.budget || '', split: t.split || '',
        urgent: !!t.urgent, links: t.links || '', notes: t.notes || t.note || '',
        checklist: (Array.isArray(t.checklist) ? t.checklist : [])
          .map(i => ({ id: i.id || uid(), text: String(i.text || ''), done: !!i.done }))
          .filter(i => i.text),
        movedAt: t.movedAt || t.stageAt || '',
      };
    }),
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
  // v39 → v40: у блога появился свой конвейер. Прежние «идеи» лежали общим
  // списком этапов сферы — переносим их как посты, ничего не выдумывая:
  // закрытая идея была публикацией, её дата закрытия и есть день выхода.
  const STAGE_KEYS = BLOG_STAGES.map(x => x.key);
  const PLACE_KEYS = BLOG_PLACES.map(x => x.key);
  const b0 = merged.blog && typeof merged.blog === 'object' ? merged.blog : {};
  merged.blog = {
    posts: (Array.isArray(b0.posts) ? b0.posts : []).map(x => ({
      id: x.id || uid(), title: String(x.title || '').trim() || 'Пост',
      place: PLACE_KEYS.includes(x.place) ? x.place : 'both',
      stage: STAGE_KEYS.includes(x.stage) ? x.stage : 'idea',
      day: typeof x.day === 'string' ? x.day : '',
      link: typeof x.link === 'string' ? x.link : '',
      views: x.views == null || x.views === '' ? null : Math.max(0, Math.round(Number(x.views) || 0)),
      format: typeof x.format === 'string' ? x.format : '',
      rubrics: Array.isArray(x.rubrics) ? x.rubrics.map(String) : [],
      // v40 → v41: свободные метки стали рубрикатором. Названия сохраняем как
      // есть — ниже они превратятся в записи рубрик, ничего не потеряв.
      tags: Array.isArray(x.tags) ? x.tags.map(String) : [],
      blocks: (Array.isArray(x.blocks) ? x.blocks : [])
        .filter(bk => bk && bk.text).map(bk => ({ id: bk.id || uid(), text: String(bk.text), done: !!bk.done })),
      seed: typeof x.seed === 'string' ? x.seed : '',
      note: typeof x.note === 'string' ? x.note : '',
      movedAt: typeof x.movedAt === 'string' ? x.movedAt : '',
    })),
    formats: (Array.isArray(b0.formats) && b0.formats.length ? b0.formats : DEFAULT_FORMATS.map(n => ({ id: uid(), name: n })))
      .filter(x => x && x.name).map(x => ({ id: x.id || uid(), name: String(x.name).trim() })),
    rubrics: (Array.isArray(b0.rubrics) ? b0.rubrics : [])
      .filter(x => x && x.name).map(x => ({ id: x.id || uid(), name: String(x.name).trim(), note: String(x.note || '') })),
    subs: (Array.isArray(b0.subs) ? b0.subs : [])
      .filter(x => x && typeof x.date === 'string')
      .map(x => ({ id: x.id || uid(), date: x.date,
        ig: x.ig == null || x.ig === '' ? null : Math.max(0, Math.round(Number(x.ig) || 0)),
        tg: x.tg == null || x.tg === '' ? null : Math.max(0, Math.round(Number(x.tg) || 0)) }))
      .sort((a2, b2) => (a2.date < b2.date ? -1 : 1)),
  };
  // v49 → v50: намерений в месяце больше нет — они про то, как хочется
  // прожить период, а месяц про дела. Уже написанные не выбрасываем: они
  // переезжают в свой квартал вместе с идентификаторами, поэтому цели,
  // которые к ним вели, остаются связанными.
  const ints = merged.intentions && typeof merged.intentions === 'object' ? merged.intentions : {};
  Object.keys(ints).filter(k => /^\d{4}-\d{2}$/.test(k)).forEach(k => {
    const qk = `${k.slice(0, 4)}-Q${Math.ceil(Number(k.slice(5, 7)) / 3)}`;
    const to = (ints[qk] ||= []);
    (ints[k] || []).forEach(i => {
      if (!to.some(x => normName(x.text) === normName(i.text))) to.push(i);
    });
    delete ints[k];
  });
  merged.intentions = ints;

  // v48 → v49: цель может вести к намерению — своему или уровнем выше.
  // Битую ссылку не чиним и не выдумываем: если намерения нет, связь просто
  // не показывается, а поле остаётся — вдруг намерение вернётся из выгрузки.
  merged.goals = (Array.isArray(merged.goals) ? merged.goals : [])
    .map(g => ({ ...g, intentId: typeof g.intentId === 'string' ? g.intentId : '' }));

  // v47 → v48: недельный анализ состояния. Ответы держим в границах шкалы,
  // а пустое оставляем пустым: незаполненный вопрос — не единица.
  const QK = REVIEW_Q.map(q => q.key), OK2 = REVIEW_OPEN.map(q => q.key);
  merged.review = Object.fromEntries(Object.entries(merged.review || {})
    .filter(([k, r]) => /^\d{4}-W\d{2}$/.test(k) && r && typeof r === 'object')
    .map(([k, r]) => [k, {
      date: typeof r.date === 'string' ? r.date.slice(0, 10) : '',
      scores: Object.fromEntries(QK.map(q => [q, Number(r.scores?.[q])])
        .filter(([, v]) => v >= 1 && v <= 5)),
      open: Object.fromEntries(OK2.map(q => [q, typeof r.open?.[q] === 'string' ? r.open[q].trim() : ''])
        .filter(([, v]) => v)),
    }]));

  // v46 → v47: сфера «Моё дело». Готовых проектов не заводим — ни одного.
  //
  // v52 → v53: вид дела стал ключом, а не подписью. Раньше видов было шесть
  // и все про цифровое — «Приложение», «Сайт», «Бот»; теперь дело может быть
  // клубом, организацией или продажами через себя, и вид выбирает подсказки.
  // Старые подписи переводим в ключи, чужое отправляем в «Другое», пустое
  // оставляем пустым: вид никто не выбирал, и выбирать за человека нечего.
  const KIND_WAS = {
    'Приложение': 'product', 'Сайт': 'product', 'Сервис': 'product',
    'Бот': 'product', 'Инструмент': 'product', 'Другое': 'other',
  };
  const bizKind = k => {
    const s = typeof k === 'string' ? k.trim() : '';
    if (!s) return '';
    if (BIZ_KIND_KEYS.includes(s)) return s;
    return KIND_WAS[s] || 'other';
  };
  const BG = BIZ_STAGES.map(x => x.key);
  const bz = merged.biz && typeof merged.biz === 'object' ? merged.biz : {};
  const str = (x, d = '') => (typeof x === 'string' ? x.trim() : d);
  merged.biz = {
    projects: (Array.isArray(bz.projects) ? bz.projects : []).map(pr => ({
      id: pr.id || uid(), name: str(pr.name) || 'Проект',
      kind: bizKind(pr.kind),
      stage: BG.includes(pr.stage) ? pr.stage : 'idea',
      link: str(pr.link), launched: str(pr.launched).slice(0, 10), note: str(pr.note),
      steps: (Array.isArray(pr.steps) ? pr.steps : []).filter(x => x && x.text)
        .map(x => ({ id: x.id || uid(), text: str(x.text), done: !!x.done })),
      metrics: (Array.isArray(pr.metrics) ? pr.metrics : []).filter(x => x && x.name)
        .map(x => ({ id: x.id || uid(), name: str(x.name), unit: str(x.unit, 'шт') })),
      marks: (Array.isArray(pr.marks) ? pr.marks : [])
        .filter(x => x && x.metricId && x.date && Number.isFinite(Number(x.value)))
        .map(x => ({ id: x.id || uid(), metricId: x.metricId, date: str(x.date).slice(0, 10), value: Number(x.value) }))
        .sort((a2, b2) => (a2.date < b2.date ? -1 : 1)),
    })),
  };

  // v45 → v46: сфера «Фриланс». Ничего готового не заводим — ни площадок,
  // ни услуг, ни шагов: их предлагают на экране, а появляются они по тапу.
  const SG = FREE_STAGES.map(x => x.key);
  const f0 = merged.free && typeof merged.free === 'object' ? merged.free : {};
  const nm = (x, d = '') => (typeof x === 'string' ? x.trim() : d);
  const money = x => Math.max(0, Math.round(Number(x) || 0));
  merged.free = {
    orders: (Array.isArray(f0.orders) ? f0.orders : []).map(o => ({
      id: o.id || uid(), title: nm(o.title) || 'Заказ',
      // place — старое название площадки строкой; ниже оно превращается в
      // ссылку на саму площадку, а здесь просто доносится в целости.
      place: nm(o.place), placeId: nm(o.placeId),
      kind: FREE_KINDS.includes(o.kind) ? o.kind : '',
      price: money(o.price), fee: Math.max(0, Math.min(100, Number(o.fee) || 0)),
      stage: SG.includes(o.stage) ? o.stage : 'talk',
      due: nm(o.due).slice(0, 10), paidAt: nm(o.paidAt).slice(0, 10),
      link: nm(o.link), note: nm(o.note), movedAt: nm(o.movedAt).slice(0, 10),
    })),
    places: (Array.isArray(f0.places) ? f0.places : []).filter(x => x && x.name)
      .map(x => ({ id: x.id || uid(), name: nm(x.name), fee: Math.max(0, Math.min(100, Number(x.fee) || 0)) })),
    services: (Array.isArray(f0.services) ? f0.services : []).filter(x => x && x.name)
      .map(x => ({ id: x.id || uid(), name: nm(x.name), price: money(x.price) })),
    steps: (Array.isArray(f0.steps) ? f0.steps : []).filter(x => x && x.text)
      .map(x => ({ id: x.id || uid(), text: nm(x.text), done: !!x.done })),
  };

  // Метки постов превращаем в рубрики: одноимённые склеиваются, порядок
  // сохраняется. После переноса метка на посте больше не нужна.
  merged.blog.posts.forEach(post => {
    (post.tags || []).forEach(name => {
      const n = normName(name);
      let r = merged.blog.rubrics.find(x => normName(x.name) === n);
      if (!r) { r = { id: uid(), name, note: '' }; merged.blog.rubrics.push(r); }
      if (!post.rubrics.includes(r.id)) post.rubrics.push(r.id);
    });
    delete post.tags;
  });

  const oldIdeas = merged.spheres?.blog?.items;
  if (Array.isArray(oldIdeas) && oldIdeas.length && !merged.blog.posts.length) {
    merged.blog.posts = oldIdeas.map(i => ({
      id: i.id || uid(), title: String(i.title || '').trim() || 'Пост',
      place: 'both',
      stage: i.done ? 'out' : (i.stage || 0) >= 2 ? 'ready' : (i.stage || 0) >= 1 ? 'draft' : 'idea',
      day: i.done && typeof i.doneAt === 'string' ? i.doneAt.slice(0, 10) : '',
      link: '', views: null, format: '', rubrics: [], blocks: [], seed: '', note: '',
      movedAt: typeof i.doneAt === 'string' ? i.doneAt.slice(0, 10) : '',
    }));
    merged.spheres.blog = { ...merged.spheres.blog, items: [] };
  }

  merged.customSpheres = (Array.isArray(merged.customSpheres) ? merged.customSpheres : []).map(sp => ({
    key: sp.key, name: sp.name || 'Сфера', icon: sp.icon || '✦', mech: sp.mech || 'своя',
    // v38 → v39: у своих сфер появилась обложка. Старым её не придумываем —
    // без ключа рисуется прежний значок, пока человек не выберет картинку сам.
    art: typeof sp.art === 'string' ? sp.art : '',
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


  // У суммы должна быть валюта. Сейчас она одна и подставляется сама — на
  // экранах ничего не меняется, — но записана она у самой суммы, а не общей
  // настройкой: иначе в день первой оплаты не в рублях все прошлые числа
  // задним числом станут двусмысленными, и разобрать их будет уже нечем.
  const CUR = 'RUB';
  const withCur = rec => { if (!rec.cur) rec.cur = CUR; };
  merged.budget.ops.forEach(withCur);
  merged.budget.vaults.forEach(withCur);
  merged.free.orders.forEach(withCur);
  merged.free.services.forEach(withCur);
  merged.lessons.forEach(withCur);

  // Заказ ссылался на площадку её названием: переименуешь Kwork — и вся история
  // заказов отвяжется. Переводим на имя площадки. Названия, которым площадки не
  // нашлось, не выбрасываем — заводим площадку: заказ помнит, откуда он пришёл.
  {
    const places = merged.free.places;
    const byName = new Map(places.map(pl => [normName(pl.name), pl]));
    merged.free.orders.forEach(o => {
      if (o.placeId || !o.place) { delete o.place; if (!o.placeId) o.placeId = ''; return; }
      const key = normName(o.place);
      let pl = byName.get(key);
      if (!pl) {
        pl = { id: uid(), name: String(o.place).trim(), fee: Number(o.fee) || 0 };
        places.push(pl);
        byName.set(key, pl);
      }
      o.placeId = pl.id;
      delete o.place;
    });
  }

  // Ссылка на модуль занятия и на показатель проекта была склеена из двух имён
  // через двоеточие — «занятие:модуль». У модуля и у показателя есть своё имя,
  // уникальное на всё приложение, и одного достаточно: склеенная ссылка ни в
  // какую таблицу не ложится. Берём вторую половину — это и есть своё имя.
  merged.goals.forEach(g => {
    if (!g.src || !['courseModule', 'bizMetric'].includes(g.src.kind)) return;
    const ref = String(g.src.ref || '');
    if (ref.includes(':')) g.src.ref = ref.split(':')[1] || '';
  });

  // Заготовки и тёзки: см. collapseTwins. Делаем до учёта записей, чтобы
  // порядок и время проставлялись уже по вычищенному списку.
  {
    const moved = new Map();
    merged.sport.tags = collapseTwins(merged.sport.tags, 'tag', moved);
    merged.sport.exercises = collapseTwins(merged.sport.exercises, 'exercise', moved);
    merged.budget.cats.expense = collapseTwins(merged.budget.cats.expense, 'expense', moved);
    merged.budget.cats.income = collapseTwins(merged.budget.cats.income, 'income', moved);
    merged.budget.vaults = collapseTwins(merged.budget.vaults, 'vault', moved);
    merged.budget.rules = collapseTwins(merged.budget.rules, 'rule', moved);
    merged.free.places = collapseTwins(merged.free.places, 'place', moved);
    merged.free.services = collapseTwins(merged.free.services, 'service', moved);
    merged.blog.formats = collapseTwins(merged.blog.formats, 'format', moved);
    merged.blog.rubrics = collapseTwins(merged.blog.rubrics, 'rubric', moved);
    merged.habits = collapseTwins(merged.habits, 'habit', moved);
    if (moved.size) {
      remapIds(merged, moved);
      // Починку надо записать на диск, а не только показать. Тёзки заводятся
      // синхронизацией, то есть при том же номере формата: без этой пометки
      // хранилище так и осталось бы с беспорядком, а в облако уехал бы он же.
      needsRewrite = true;
    }
  }

  // Учёт записей заводим один раз, честно: место в списке мы знаем точно, а
  // время появления — только если у записи есть своя дата. Выдумывать «создано
  // сегодня» для всего разом нельзя: это было бы неправдой про каждую строку.
  const dateOf = r => [r.createdAt, r.date, r.day, r.start, r.paidAt, r.finished]
    .find(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x)) || '';
  eachList(merged, list => {
    list.forEach((rec, i) => {
      if (!rec || typeof rec !== 'object') return;
      if (idOf(rec) == null) rec.id = uid();
      if (rec.order !== i) rec.order = i;
      if (rec.createdAt == null) rec.createdAt = dateOf(rec);
      if (rec.updatedAt == null) rec.updatedAt = '';
    });
  });
  merged.changedAt = typeof merged.changedAt === 'string' ? merged.changedAt : '';
  merged.touched = merged.touched && typeof merged.touched === 'object' && !Array.isArray(merged.touched)
    ? Object.fromEntries(Object.entries(merged.touched).filter(([, v]) => typeof v === 'string'))
    : {};
  merged.deleted = (Array.isArray(merged.deleted) ? merged.deleted : [])
    .filter(x => x && typeof x.id === 'string')
    .map(x => ({ id: x.id, from: String(x.from || ''), at: String(x.at || '') }));

  return merged;
}

// Ставится в load(), если на диске лежит не текущий формат — тогда после
// запуска сразу перезаписываем, чтобы старый формат не уехал в экспорт.
let needsRewrite = false;
// Пока сохранение заблокировано, приложение не пишет на диск ни байта:
// поверх нечитаемых данных писать нельзя, пока человек не решил, что с ними делать.
let saveBlocked = false;

/**
 * Ошибка чтения не должна стоить человеку данных. Раньше любой сбой в
 * миграции молча подставлял чистое состояние и сохранял его поверх — одна
 * забытая строка импорта стирала всё. Теперь при сбое сохранение
 * блокируется, сырой текст откладывается рядом, и приложение об этом
 * говорит вслух, а не делает вид, что всё хорошо.
 */
export let loadError = null;
/** Сохранения нет, но копия рядом есть. Ничего не пишем, пока человек не решил. */
export let dataLost = false;
export const rescueRaw = () => { try { return localStorage.getItem(RESCUE); } catch { return null; } };
/** Состояние до последней смены формата — на случай, если новая что-то потеряла. */
export const prevRaw = () => { try { return localStorage.getItem(PREV); } catch { return null; } };
export const dropRescue = () => { try { localStorage.removeItem(RESCUE); } catch {} };

/** Вернуть отложенную копию. Единственный путь наружу из «данные потерялись». */
export function restoreCopy() {
  const raw = prevRaw() || rescueRaw();
  if (!raw) throw new Error('копии нет');
  const parsed = JSON.parse(raw);
  dataLost = false;
  saveBlocked = false;
  adoptState(parsed);
}

/** Согласиться начать заново: копию не трогаем, она ещё может пригодиться. */
export function acceptEmpty() {
  dataLost = false;
  saveBlocked = false;
  save();
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* хранилище недоступно */ }
  if (!raw) {
    // Сохранения нет, а отложенная копия рядом лежит — значит, это не новый
    // человек, а потерянные данные: очистили браузер, сбросилось хранилище.
    // Молча завести пустое состояние и записать его поверх — худшее, что тут
    // можно сделать: человек увидит чистый лист и решит, что всё пропало.
    if (prevRaw() || rescueRaw()) {
      dataLost = true;
      needsRewrite = false;
      saveBlocked = true;
      return migrate(blank());
    }
    needsRewrite = true;
    return migrate(blank());
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.v !== VERSION) {
      needsRewrite = true;
      // Перед сменой формата откладываем то, что было: обратной миграции нет,
      // и если новая что-то потеряет, взять данные будет больше неоткуда.
      try { localStorage.setItem(PREV, raw); } catch { /* нет места — идём дальше */ }
    }
    return migrate(parsed);
  } catch (e) {
    console.error('[lifeos] не удалось прочитать сохранение', e);
    loadError = String(e?.message || e);
    // Сырой текст кладём рядом — из него всё можно вернуть.
    try { localStorage.setItem(RESCUE, raw); } catch { /* нет места — хоть не затрём */ }
    // Главное: ничего не пишем поверх и не помечаем состояние к перезаписи.
    needsRewrite = false;
    saveBlocked = true;
    return migrate(blank());
  }
}

/**
 * Открывая приложение, человек ждёт сегодняшний день, этот месяц и этот год.
 * Где он листал в прошлый раз — это не данные, а место, на котором он тогда
 * остановился: помнить его через сутки, а тем более через год, значит встречать
 * его чужим днём. Внутри сеанса листание, конечно, сохраняется.
 */
function toNow(s) {
  const t = todayISO();
  const u = s.ui || (s.ui = {});
  u.date = t;
  u.weekAnchor = t;
  u.habitAnchor = t;
  u.monthAnchor = monthKey(t);
  u.budMonth = monthKey(t);
  u.year = yearOf(t);
  u.trackYear = yearOf(t);
  u.tripYear = yearOf(t);
  return s;
}

export const S = toNow(load());

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

let saveTimer = null;
export function save() {
  // Данные не прочитались — значит, писать поверх них нельзя ничем и никогда,
  // пока человек не решит: вернуть из отложенной копии или начать заново.
  if (saveBlocked) return;
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

/** Начать заново осознанно: отложенная копия убирается, запись разрешается.
 *  Пишем сразу, а не отложенно: следом идёт перезагрузка страницы. */
export function acceptFreshStart() {
  dropRescue();
  loadError = null;
  saveBlocked = false;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error('[lifeos]', e); }
}

/**
 * Сохранить, не перерисовывая экран. Нужно там, где перерисовка сломала бы
 * жест: ползунок пересоздался бы прямо под пальцем.
 */

// ── учёт записей ────────────────────────────────────────────────
// Запись — объект в списке. Списки ищем обходом, а не по перечню имён: новая
// ветка попадает под учёт сама, без того чтобы кто-то вспомнил её дописать.

/**
 * Обойти все списки записей: fn(список, путь). Сам список следов от удаления
 * под учёт не попадает: это записи о записях, и если считать их живыми, то
 * след объявляется воскресшим и стирается ровно в момент появления.
 */
function eachList(node, fn, path = '', depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return;
  for (const [k, v] of Object.entries(node)) {
    if (!path && k === 'deleted') continue;
    const at = path ? `${path}.${k}` : k;
    if (Array.isArray(v)) {
      if (v.some(x => x && typeof x === 'object')) fn(v, at);
      v.forEach(x => eachList(x, fn, at + '[]', depth + 1));
    } else if (v && typeof v === 'object') {
      eachList(v, fn, at, depth + 1);
    }
  }
}

/**
 * Ключи-периоды: день, месяц, неделя, год. По ним лежат ежедневные отметки —
 * сон, энергия, вода, отметки привычек, значения трекера, планы бюджета.
 */
const PERIOD_KEY = /^\d{4}(-\d{2}(-\d{2})?|-W\d{2}|-Q[1-4])?$/;

/**
 * Обойти ежедневные отметки: fn(путь, значение). Единицей считается всё, что
 * лежит под первым же ключом-периодом: «сон за 30 августа», «план бюджета за
 * август». Путь через записи идёт по их именам, а не по местам в списке, —
 * иначе на другом устройстве тот же самый день назывался бы иначе.
 *
 * Списки записей под даты не попадают: у записи есть своё время правки, и
 * считать её ещё и отметкой дня значило бы мерить одно двумя способами.
 */
function eachMark(node, fn, path = '', depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return;
  if (Array.isArray(node)) {
    for (const rec of node) {
      const id = rec && typeof rec === 'object' ? idOf(rec) : null;
      if (id) eachMark(rec, fn, `${path}[${id}]`, depth + 1);
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (!path && (k === 'deleted' || k === 'touched')) continue;
    const at = path ? `${path}.${k}` : k;
    if (PERIOD_KEY.test(k)) {
      // Массив записей под датой — это записи, а не отметка дня.
      if (Array.isArray(v) && v.some(x => x && typeof x === 'object' && idOf(x))) continue;
      fn(at, v);
    } else {
      eachMark(v, fn, at, depth + 1);
    }
  }
}

/**
 * Отпечаток записи — всё, кроме времени правки: иначе сама отметка о правке
 * считалась бы правкой и время обновлялось бы на каждом сохранении.
 */
function fingerprint(rec) {
  const { updatedAt, ...rest } = rec;
  return JSON.stringify(rest);
}

/**
 * Чем запись себя называет. У большинства это id, у своих сфер — key: он и
 * есть их имя во всём приложении. Второго имени заводить нельзя — запись
 * перестаёт узнавать саму себя там, где сверяется по имени.
 */
function idOf(rec) { return rec.id ?? rec.key ?? null; }

/**
 * Слепок «что было»: имена записей с отпечатками и ежедневные отметки с их
 * значениями. Снимается до изменения — по нему потом видно, что именно
 * поменялось, а что человек просто открыл и закрыл.
 */
function snapshot(state) {
  const recs = new Map();
  eachList(state, (list, at) => {
    for (const rec of list) {
      const id = rec && typeof rec === 'object' ? idOf(rec) : null;
      if (id) recs.set(id, { fp: fingerprint(rec), at });
    }
  });
  const marks = new Map();
  eachMark(state, (at, v) => marks.set(at, JSON.stringify(v)));
  return { recs, marks };
}

/**
 * Проставить учёт после изменения: у записи есть свой id, место в списке,
 * время появления и время последней правки; у удалённой остаётся след.
 *
 * Делается в одном месте, а не в сотне мест записи: иначе однажды кто-нибудь
 * забудет поставить отметку — и запись станет невидимой для сверки, а удаление
 * бесследным. Время нужно, чтобы две версии одних данных можно было слить;
 * след от удаления — чтобы удалённое не вернулось с другого устройства.
 */
function stampRecords(state, before) {
  const now = new Date().toISOString();
  const alive = new Set();
  const wasRecs = before.recs, wasMarks = before.marks;
  eachList(state, list => {
    list.forEach((rec, i) => {
      if (!rec || typeof rec !== 'object') return;
      if (idOf(rec) == null) rec.id = uid();
      const id = idOf(rec);
      alive.add(id);
      // Место в списке — это данные: порядок этапов, правил и карточек человек
      // задал сам, а у строк в таблице позиции не бывает.
      if (rec.order !== i) rec.order = i;
      const was = wasRecs.get(id);
      if (!was) {
        // Запись появилась при нас — вот теперь время известно точно.
        if (!rec.createdAt) rec.createdAt = now;
        rec.updatedAt = now;
        return;
      }
      if (was.fp !== fingerprint(rec)) rec.updatedAt = now;
    });
  });
  const gone = [];
  for (const [id, was] of wasRecs) if (!alive.has(id)) gone.push({ id, from: was.at, at: now });
  // Запись с тем же id вернулась — след больше не нужен.
  const kept = (state.deleted || []).filter(x => !alive.has(x.id));
  if (gone.length || kept.length !== (state.deleted || []).length) state.deleted = [...kept, ...gone];

  // Ежедневные отметки лежат ящиками по датам, и своего места для времени у
  // них нет: ключ — сама дата. Поэтому «когда трогали» держим отдельным
  // плоским указателем. Так форма отметок не меняется — сон остаётся числом,
  // а не числом с довеском, — но при слиянии двух устройств видно, чья
  // отметка свежее. Без этого сон, вода и отметки привычек сливались бы
  // вслепую: это ровно те данные, которые пишутся каждый день.
  state.changedAt = now;
  const touched = state.touched || (state.touched = {});
  const seenMarks = new Set();
  eachMark(state, (at, v) => {
    seenMarks.add(at);
    const was = wasMarks.get(at);
    const nowVal = JSON.stringify(v);
    if (was !== nowVal) touched[at] = now;
  });
  // Отметку стёрли — это тоже событие, и у него есть время.
  for (const at of wasMarks.keys()) if (!seenMarks.has(at)) touched[at] = now;
}

export function updateQuiet(mutator) {
  const before = snapshot(S);
  mutator(S);
  stampRecords(S, before);
  save();
}

/** Единственный способ менять состояние: мутируем внутри, дальше — сохранение и перерисовка. */
export function update(mutator) {
  const before = snapshot(S);
  mutator(S);
  stampRecords(S, before);
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
/** Привычка «приёмы пищи»: число берётся из «Питания» и руками не ставится. */
export const isMeals = hb => hb?.link === 'meals';
export const waterOf = (s, date) => Math.max(0, Number(s.food.days[date]?.water) || 0);
export const waterNorm = s => Math.max(1, Number(s.food.targets.water) || 1);

export function tickHabit(s, id, date) {
  const hb = s.habits.find(x => x.id === id);
  if (!hb) return null;
  // Приём пищи нельзя «отметить» — его едят. Число приходит из «Питания».
  if (isMeals(hb)) return { readOnly: true, name: hb.name };
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
  adoptState(parsed);
}

/**
 * Принять состояние целиком — из копии или из облака. Отметки времени при этом
 * не трогаем: записи, пришедшие с другого устройства, менялись там и тогда, а
 * не здесь и сейчас. Проставь мы им нынешнее время — при следующем слиянии
 * они притворились бы самыми свежими и затёрли бы то, что новее на самом деле.
 *
 * А вот якоря — открытый день, неделя, месяц, год — приезжать не должны: это
 * не данные, а место, на котором человек стоит здесь и сейчас. Приложение
 * подтягивало их вместе со всем остальным, и экран сам уезжал на день, который
 * последним трогали на другом устройстве. Оставляем свои, а если их нет —
 * ставим нынешние, как при запуске.
 */
const ANCHORS = ['date', 'weekAnchor', 'habitAnchor', 'monthAnchor', 'budMonth', 'year', 'trackYear', 'tripYear'];

export function adoptState(raw) {
  const mine = {};
  for (const k of ANCHORS) if (S.ui && S.ui[k] !== undefined) mine[k] = S.ui[k];
  const next = toNow(migrate(raw));
  Object.assign(next.ui, mine);
  S_replace(next);
  save();
  listeners.forEach(fn => fn());
}

function S_replace(next) {
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, next);
}

/** Снимок состояния для отправки — ровно то, что лежит на диске. */
export const stateSnapshot = () => JSON.parse(JSON.stringify(S));

export function resetAll() {
  update(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, blank()); });
}
