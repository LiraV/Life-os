// Календарь Life OS на домашний экран. Scriptable, средний виджет.
//
// Виджет только читает: он берёт из облака ту же копию, что синхронизирует
// приложение, и рисует месяц с отметками занятых дней и список на сегодня.
// Ничего не записывает — виджет не место для решений.
//
// Считаем только то, что лежит на дате явно: квесты, тренировки, рабочие
// задачи с днём работы, задания учёбы со сроком, посты с днём выхода.
// Расписания сюда не тянем: их пересчёт — половина приложения, а ошибиться в
// нём на домашнем экране хуже, чем не показать.

const APP = 'https://lirav.github.io/Life-os/';
const API = 'https://d5djrp8uk7udp0h0dlpi.bu9mdbe1.apigw.yandexcloud.net';
const CACHE = 'lifeos-widget.json';

// ── чистая часть: её же проверяет прогон на Node ────────────────

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Дни месяца сеткой с понедельника: пустые клетки — null. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const shift = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(shift).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * Сколько дел на каждый день месяца. Закрытое не считаем: календарь показывает,
 * чем день занят, а сделанное день уже не занимает.
 */
function busyByDate(state, ym) {
  const out = {};
  const add = (date, n = 1) => {
    if (typeof date !== 'string' || !date.startsWith(ym)) return;
    out[date] = (out[date] || 0) + n;
  };
  const quests = state.quests || {};
  for (const [date, list] of Object.entries(quests)) {
    add(date, (Array.isArray(list) ? list : []).filter(q => !q.done).length);
  }
  for (const w of state.sport?.workouts || []) if (!w.done) add(w.date);
  for (const t of state.work?.tasks || []) if (t.day && !['done', 'ot-done'].includes(t.column)) add(t.day);
  for (const t of state.study?.tasks || []) if (t.due && t.stage !== 'done') add(t.due);
  for (const p of state.blog?.posts || []) if (p.day && p.stage !== 'out') add(p.day);
  return out;
}

/** Что стоит на сегодня — списком, самое раннее первым. */
function todayList(state, date) {
  const rows = [];
  for (const q of state.quests?.[date] || []) {
    if (!q.done) rows.push({ time: q.time || '', text: q.title || 'Квест' });
  }
  for (const w of state.sport?.workouts || []) {
    if (w.date === date && !w.done) rows.push({ time: w.time || '', text: w.title || 'Тренировка' });
  }
  for (const t of state.work?.tasks || []) {
    if (t.day === date && !['done', 'ot-done'].includes(t.column)) rows.push({ time: '', text: t.title || 'Работа' });
  }
  for (const t of state.study?.tasks || []) {
    if (t.due === date && t.stage !== 'done') rows.push({ time: '', text: t.title || 'Учёба' });
  }
  return rows.sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const DOW = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

// Экспорт для прогона на Node: в Scriptable этого объекта нет, и блок молчит.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { monthGrid, busyByDate, todayList, iso };
}

// ── часть для Scriptable ────────────────────────────────────────
if (typeof config !== 'undefined') {
  const BG1 = new Color('#2f2831'), BG2 = new Color('#241f26');
  const INK = new Color('#f3e7e0'), DIM = new Color('#a89aa2'), ACC = new Color('#c8574f');

  /** Токен: сначала из параметра виджета, потом из связки ключей. */
  async function token() {
    const p = (args.widgetParameter || '').trim();
    if (p) { Keychain.set('lifeos-token', p); return p; }
    if (Keychain.contains('lifeos-token')) return Keychain.get('lifeos-token');
    return '';
  }

  /** Данные: из облака, а без сети — из последней копии рядом со скриптом. */
  async function loadState(tk) {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), CACHE);
    try {
      const req = new Request(API + '/state');
      req.headers = { Authorization: 'OAuth ' + tk };
      req.timeoutInterval = 12;
      const body = await req.loadJSON();
      const state = body && body.state ? body.state : body;
      if (state && typeof state === 'object') {
        fm.writeString(path, JSON.stringify(state));
        return { state, stale: false };
      }
    } catch (e) { /* сеть подождёт, копия важнее пустого экрана */ }
    if (fm.fileExists(path)) {
      try { return { state: JSON.parse(fm.readString(path)), stale: true }; } catch (e) { /* копия битая */ }
    }
    return { state: null, stale: false };
  }

  function shell() {
    const w = new ListWidget();
    const g = new LinearGradient();
    g.colors = [BG1, BG2];
    g.locations = [0, 1];
    w.backgroundGradient = g;
    w.setPadding(12, 14, 12, 14);
    w.url = APP + '#/day';
    return w;
  }

  function message(text, hint) {
    const w = shell();
    const t = w.addText(text);
    t.font = Font.semiboldSystemFont(14);
    t.textColor = INK;
    if (hint) {
      w.addSpacer(4);
      const h = w.addText(hint);
      h.font = Font.systemFont(11);
      h.textColor = DIM;
      h.minimumScaleFactor = 0.8;
    }
    return w;
  }

  function build(state, stale) {
    const now = new Date();
    const ym = iso(now).slice(0, 7);
    const today = iso(now);
    const busy = busyByDate(state, ym);
    const cells = monthGrid(now.getFullYear(), now.getMonth());
    const rows = todayList(state, today);

    const w = shell();
    const body = w.addStack();
    body.layoutHorizontally();

    // ── слева календарь ──
    const cal = body.addStack();
    cal.layoutVertically();
    const head = cal.addText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
    head.font = Font.semiboldSystemFont(12);
    head.textColor = INK;
    cal.addSpacer(4);

    const dow = cal.addStack();
    dow.layoutHorizontally();
    for (const d of DOW) {
      const c = dow.addStack();
      c.size = new Size(20, 11);
      const t = c.addText(d);
      t.font = Font.systemFont(8);
      t.textColor = DIM;
    }
    cal.addSpacer(2);

    for (let i = 0; i < cells.length; i += 7) {
      const row = cal.addStack();
      row.layoutHorizontally();
      for (const d of cells.slice(i, i + 7)) {
        const c = row.addStack();
        c.size = new Size(20, 17);
        c.layoutVertically();
        if (d == null) { c.addSpacer(); continue; }
        const date = `${ym}-${String(d).padStart(2, '0')}`;
        const isToday = date === today;
        const line = c.addStack();
        line.layoutHorizontally();
        const t = line.addText(String(d));
        t.font = isToday ? Font.boldSystemFont(10) : Font.systemFont(10);
        t.textColor = isToday ? ACC : (date < today ? DIM : INK);
        if (busy[date]) {
          line.addSpacer(2);
          const dot = line.addText('•');
          dot.font = Font.systemFont(10);
          dot.textColor = isToday ? ACC : DIM;
        }
      }
    }

    body.addSpacer(10);

    // ── справа сегодня ──
    const side = body.addStack();
    side.layoutVertically();
    const cap = side.addText(rows.length ? `сегодня · ${rows.length}` : 'сегодня');
    cap.font = Font.semiboldSystemFont(11);
    cap.textColor = DIM;
    side.addSpacer(4);
    if (!rows.length) {
      const free = side.addText('Пусто. И это тоже план.');
      free.font = Font.systemFont(12);
      free.textColor = INK;
      free.minimumScaleFactor = 0.8;
    }
    for (const r of rows.slice(0, 4)) {
      const line = side.addText(`${r.time ? r.time + '  ' : ''}${r.text}`);
      line.font = Font.systemFont(12);
      line.textColor = INK;
      line.lineLimit = 1;
      line.minimumScaleFactor = 0.7;
      side.addSpacer(3);
    }
    if (rows.length > 4) {
      const more = side.addText(`и ещё ${rows.length - 4}`);
      more.font = Font.systemFont(11);
      more.textColor = DIM;
    }
    side.addSpacer();
    if (stale) {
      const old = side.addText('без сети — вчерашняя копия');
      old.font = Font.systemFont(9);
      old.textColor = DIM;
      old.minimumScaleFactor = 0.7;
    }
    return w;
  }

  // Запуск в своей функции, а не сверху файла: с ожиданием на верхнем уровне
  // файл перестаёт читаться как обычный модуль, и его нельзя проверить прогоном.
  (async () => {
    const tk = await token();
    let widget;
    if (!tk) {
      widget = message('Нужен код доступа',
        'Настройки приложения → «Виджет на экран» → скопируй код и вставь его в поле Parameter у виджета.');
    } else {
      const { state, stale } = await loadState(tk);
      widget = state ? build(state, stale)
        : message('Не удалось получить данные', 'Проверь код доступа: возможно, вход в приложении устарел.');
    }
    if (config.runsInWidget) Script.setWidget(widget);
    else await widget.presentMedium();
    Script.complete();
  })();
}
