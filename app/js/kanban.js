// Доска работы: процесс ведения рекламных кампаний, перенесённый один в один
// из отдельного канбана. Колонки, группы и чек-листы этапов — это не общая
// заготовка, а конкретный рабочий процесс, поэтому они и живут здесь целиком.
//
// Зоны сверху вниз: сначала то, что горит (РК и архив), потом расчёт МП,
// внизу прочие задачи. Порядок взят из исходной доски.

export const KGROUPS = {
  mp: { name: '🧮 Медиаплан', cls: 'kg-mp' },
  rk: { name: '🚀 Рекламная кампания', cls: 'kg-rk' },
  ar: { name: '🗂 Архив', cls: 'kg-ar' },
  other: { name: '📌 Прочие задачи', cls: 'kg-ot' },
};

export const KCOLUMNS = [
  { id: 'l1', group: 'mp', emoji: '📥', title: 'L1 · Новые запросы', hint: 'Принят запрос на расчёт МП — уточняем вводные' },
  { id: 'mp-calc', group: 'mp', emoji: '🧮', title: 'Расчёт МП', hint: 'Считаем медиаплан' },
  { id: 'mp-front', group: 'mp', emoji: '📨', title: 'МП у фронтов', hint: 'Отправлен фронтам, ждём ответ заказчика' },
  { id: 'mp-edits', group: 'mp', emoji: '✏️', title: 'Правки МП', hint: 'Вернули с правками — пересчитываем' },
  { id: 'mp-done', group: 'mp', emoji: '✅', title: 'МП согласован', hint: 'Ждём заявку на РК (может не дойти до запуска)' },
  { id: 'rk-check', group: 'rk', emoji: '📋', title: 'Проверка заявки', hint: 'Проверяем: брони, креативы, пиксели, тексты' },
  { id: 'rk-fix', group: 'rk', emoji: '🔁', title: 'Заявка на доработке', hint: 'Вернули фронтам — ждём исправления' },
  { id: 'rk-setup', group: 'rk', emoji: '🛠️', title: 'Заведение РК', hint: 'Заводим кампанию в кабинете площадки' },
  { id: 'rk-mod', group: 'rk', emoji: '🛡️', title: 'Модерация', hint: 'Ждём решение площадки' },
  { id: 'rk-modfix', group: 'rk', emoji: '🚫', title: 'Правки по модерации', hint: 'Не прошли — фронтам с комментариями площадки' },
  { id: 'rk-planned', group: 'rk', emoji: '🗓️', title: 'Запланирована', hint: 'Заведена, модерация пройдена — ждём даты запуска' },
  { id: 'rk-launch', group: 'rk', emoji: '🚀', title: 'Запуск · Скрины', hint: 'Скрины: баннер, посадочная, календарь → фронтам' },
  { id: 'rk-live', group: 'rk', emoji: '🟢', title: 'Запущена · Крутится', hint: 'Открутка идёт, отчёты пока не запрашивали' },
  { id: 'rk-run', group: 'rk', emoji: '📊', title: 'Ведение · Отчёты', hint: 'Еженедельные отчёты, корректировки открутки и частоты' },
  { id: 'rk-final', group: 'rk', emoji: '🏁', title: 'Финальная статистика', hint: 'Финальный отчёт по завершении РК' },
  { id: 'done', group: 'ar', emoji: '✔️', title: 'Завершено', hint: 'Сделано и отправлено' },
  { id: 'ot-todo', group: 'other', emoji: '🗒️', title: 'Сделать', hint: 'Внутренние и личные задачи — всё, что не МП/РК' },
  { id: 'ot-progress', group: 'other', emoji: '⚙️', title: 'В работе', hint: 'Делаю сейчас' },
  { id: 'ot-done', group: 'other', emoji: '☑️', title: 'Готово', hint: 'Сделано' },
];

/** Зоны доски: горящее сверху, расчёт ниже, прочее в самом низу. */
export const KZONES = [['rk', 'ar'], ['mp'], ['other']];

export const KTYPES = ['МП', 'РК', 'Прочее'];

export const PLATFORMS = [
  { id: 'ozon', name: 'Озон', cls: 'pf-ozon' },
  { id: 'wb', name: 'WB', cls: 'pf-wb' },
  { id: 'ue-market', name: 'УЭ · Маркет', cls: 'pf-ue-market' },
  { id: 'ue-lavka', name: 'УЭ · Лавка', cls: 'pf-ue-lavka' },
  { id: 'ue-go', name: 'УЭ · Го', cls: 'pf-ue-go' },
  { id: 'ue-eda', name: 'УЭ · Еда', cls: 'pf-ue-eda' },
  { id: 'other', name: 'Другая', cls: 'pf-other' },
];

/** Чек-листы этапов: добавляются при попадании карточки в колонку. */
export const KTEMPLATES = {
  'l1': [
    'Зафиксировать вводные: бюджет, период, гео',
    'Уточнить форматы и площадки',
    'Уточнить дедлайн по МП',
  ],
  'mp-calc': [
    'Собрать бенчмарки / прогнозатор площадки',
    'Просчитать медиаплан',
    'Самопроверка: бюджет, охваты, единицы измерения',
    'Отправить МП фронтам',
  ],
  'rk-check': [
    'Брони прописаны',
    'Креативы приложены и соответствуют спекам площадки',
    'Пиксели прописаны',
    'Тексты приложены',
    'Даты, гео и бюджет сходятся с согласованным МП',
  ],
  'rk-setup': [
    'Создать кампанию в кабинете площадки',
    'Загрузить креативы',
    'Прописать пиксели и UTM',
    'Настроить таргетинги и гео',
    'Выставить бюджет и ставки',
    'Проверить календарь / расписание показов',
    'Отправить на модерацию',
  ],
  'rk-modfix': [
    'Зафиксировать комментарии площадки',
    'Отправить фронтам на правки',
    'Получить исправленные материалы',
    'Перезалить и снова отправить на модерацию',
  ],
  'rk-planned': [
    'Зафиксировать дату запуска',
    'Накануне старта проверить кампанию в кабинете',
  ],
  'rk-launch': [
    'Скрин баннера на площадке',
    'Скрин перехода на посадочную',
    'Скрин календаря',
    'Отправить скрины фронтам',
  ],
  'rk-run': ['Настроить доступ к статистике кабинета'],
  'rk-final': [
    'Выгрузить финальную статистику',
    'Сверить открутку с планом и бюджетом',
    'Собрать финальный отчёт',
    'Отправить фронтам',
  ],
};

export const WEEKLY_ITEMS = ['выгрузка', '% выполнения', 'открутка/частота', 'отправить фронтам'];

export const kColumn = id => KCOLUMNS.find(c => c.id === id) || KCOLUMNS[0];
export const kColumnName = id => { const c = kColumn(id); return `${c.emoji} ${c.title}`; };
export const platformById = id => PLATFORMS.find(p => p.id === id) || null;
/** Колонки, которые считаются закрытыми: из них задача не просится на день. */
export const K_DONE = ['done', 'ot-done'];
export const isDoneColumn = id => K_DONE.includes(id);

/** Недели месяца (пн–вс), обрезанные границами месяца, — для отчётов. */
export function weeksOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const weeks = [];
  let start = new Date(first);
  while (start <= last) {
    const end = new Date(start);
    end.setDate(end.getDate() + (7 - ((end.getDay() + 6) % 7)) - 1);
    const realEnd = end > last ? last : end;
    weeks.push([new Date(start), new Date(realEnd)]);
    start = new Date(realEnd);
    start.setDate(start.getDate() + 1);
  }
  return weeks;
}

const dm = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
export const weeklyText = (i, s, e) => `Отчёт W${i + 1} (${dm(s)}–${dm(e)}): ${WEEKLY_ITEMS.join(', ')}`;

const MON = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return `${MON[m - 1]} ${String(y).slice(2)}`;
}
export function monthShift(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
