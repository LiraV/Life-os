// Работа с реальными датами. Всё в локальной зоне пользователя, ключи — «YYYY-MM-DD».

export const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
export const DOW_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const pad = n => String(n).padStart(2, '0');

export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => iso(new Date());

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(s) {
  const d = parseISO(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

export const weekDates = s => { const m = startOfWeek(s); return Array.from({ length: 7 }, (_, i) => addDays(m, i)); };

/** Номер недели по ISO 8601 — неделя принадлежит году своего четверга. */
export function isoWeek(s) {
  const t = parseISO(s);
  t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
  const firstThu = new Date(t.getFullYear(), 0, 4);
  firstThu.setDate(firstThu.getDate() - ((firstThu.getDay() + 6) % 7) + 3);
  return { year: t.getFullYear(), week: 1 + Math.round((t - firstThu) / 604800000) };
}

export function weekKey(s) { const { year, week } = isoWeek(s); return `${year}-W${pad(week)}`; }

export const monthKey = s => s.slice(0, 7);
export const yearOf = s => Number(s.slice(0, 4));

/** '2026-08' → '2026-Q3'; ключ периода для целей квартала. */
export const quarterKey = ym => `${ym.slice(0, 4)}-Q${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;
export const quarterMonths = qk => {
  const y = qk.slice(0, 4), n = Number(qk.slice(6));
  return [0, 1, 2].map(i => `${y}-${String((n - 1) * 3 + 1 + i).padStart(2, '0')}`);
};

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthDates = ym => Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${pad(i + 1)}`);

export const dowIndex = s => (parseISO(s).getDay() + 6) % 7;

/** «Вторник, 17» — заголовок дня. */
export const dayTitle = s => `${DOW_FULL[dowIndex(s)]}, ${parseISO(s).getDate()}`;
export const dayShort = s => `${parseISO(s).getDate()} ${MONTHS_GEN[Number(s.slice(5, 7)) - 1]}`;
export const monthTitle = ym => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
/** Предложный падеж: «в августе», а не «в август». */
export const MONTHS_PRE = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
  'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
export const monthIn = ym => MONTHS_PRE[Number(ym.slice(5, 7)) - 1];

/** «сегодня» / «вчера» / «завтра» — иначе null. */
export function relativeDay(s) {
  const t = todayISO();
  if (s === t) return 'сегодня';
  if (s === addDays(t, -1)) return 'вчера';
  if (s === addDays(t, 1)) return 'завтра';
  return null;
}

export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);

/**
 * «сегодня в 13:26», «вчера в 9:05», «24 августа, 13:26» — отметка времени
 * последней правки. Одна на все разделы: трекер и бюджет пишут одинаково.
 */
export function stampLabel(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${d.getHours()}:${pad(d.getMinutes())}`;
  const t = todayISO();
  if (date === t) return `сегодня в ${time}`;
  if (date === addDays(t, -1)) return `вчера в ${time}`;
  return `${dayShort(date)}, ${time}`;
}
