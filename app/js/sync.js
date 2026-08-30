// Слияние двух копий данных: телефон и ноутбук пишут независимо, а сойтись
// должны в одно. Здесь только правила слияния — ни сети, ни сервера: их можно
// подставить любые, а вот правила должны быть одни и проверяемые.
//
// Правил ровно четыре, и каждое отвечает своему виду данных:
//
//  1. Запись из списка (цель, заказ, привычка) — у неё есть своё время правки:
//     побеждает та, которую правили позже.
//  2. След от удаления — побеждает запись, если её правили после удаления, и
//     удаление, если оно случилось после последней правки. Иначе удалённое
//     возвращалось бы с другого устройства, а вернувшееся молча пропадало.
//  3. Ежедневная отметка (сон, вода, отметка привычки) — у неё нет своего
//     места для времени, поэтому время лежит в указателе «что когда трогали»:
//     побеждает отметка того дня, который трогали позже.
//  4. Всё остальное — имя, рост, настройки — своего времени не имеет и меняется
//     редко: берём сторону, которую вообще трогали позже.
//
// Отдельно — накопительные итоги: опыт персонажа не «побеждает», а берётся
// наибольший. Он только растёт, и выбрать одну сторону значило бы отнять уже
// заработанное.

const PERIOD_KEY = /^\d{4}(-\d{2}(-\d{2})?|-W\d{2}|-Q[1-4])?$/;
const idOf = rec => (rec && typeof rec === 'object' ? rec.id ?? rec.key ?? null : null);
const isRecordList = v => Array.isArray(v) && v.some(x => idOf(x));
const clone = v => JSON.parse(JSON.stringify(v));

/** Пустое время значит «раньше всего, что мы считали». */
const newer = (a, b) => String(a || '') > String(b || '');

/** Когда запись удалили — по следам той стороны, где след есть. */
const killedAt = (state, id) => (state.deleted || []).find(x => x.id === id)?.at || '';

/**
 * Слить две копии. Порядок сторон не важен: результат один и тот же — это
 * проверяется. Ни одна из копий не меняется.
 */
export function merge(a, b) {
  const mineNewer = newer(a.changedAt, b.changedAt);
  const [lead, other] = mineNewer ? [a, b] : [b, a];
  const out = clone(lead);

  mergeNode(out, other, lead, '', { a, b });

  // Указатели служебные: их сливаем по своим правилам, а не как данные.
  out.touched = {};
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src.touched || {})) {
      if (newer(v, out.touched[k])) out.touched[k] = v;
    }
  }
  const traces = new Map();
  for (const src of [a, b]) {
    for (const d of src.deleted || []) {
      const was = traces.get(d.id);
      if (!was || newer(d.at, was.at)) traces.set(d.id, d);
    }
  }
  out.deleted = [...traces.values()];
  out.changedAt = newer(a.changedAt, b.changedAt) ? a.changedAt : b.changedAt;
  // Опыт только растёт: выбрать одну сторону значило бы отнять заработанное.
  out.user.xp = Math.max(Number(a.user?.xp) || 0, Number(b.user?.xp) || 0);
  return out;
}

/**
 * Слияние ветки. `out` — уже копия ведущей стороны, `other` — вторая копия,
 * `lead` — та же ведущая, но исходная: из неё читаем, в `out` пишем.
 */
function mergeNode(out, other, lead, path, all) {
  if (!other || typeof other !== 'object') return;
  for (const [k, theirs] of Object.entries(other)) {
    if (!path && ['deleted', 'touched', 'changedAt'].includes(k)) continue;
    const at = path ? `${path}.${k}` : k;
    const mine = lead ? lead[k] : undefined;

    if (PERIOD_KEY.test(k)) {
      if (isRecordList(theirs) || isRecordList(mine)) {
        out[k] = mergeList(mine, theirs, all);
      } else {
        out[k] = pickMark(at, mine, theirs, all);
        if (out[k] === undefined) delete out[k];
      }
      continue;
    }
    if (isRecordList(theirs) || isRecordList(mine)) { out[k] = mergeList(mine, theirs, all); continue; }
    if (theirs && typeof theirs === 'object' && !Array.isArray(theirs)) {
      if (!out[k] || typeof out[k] !== 'object') out[k] = clone(theirs);
      else mergeNode(out[k], theirs, mine, at, all);
      continue;
    }
    // Простое значение: ведущая сторона уже в out, второй стороне слова нет —
    // кроме случая, когда у ведущей его вовсе не было.
    if (mine === undefined) out[k] = clone(theirs);
  }
}

/** Отметка дня: чей день трогали позже, того и значение. */
function pickMark(at, mine, theirs, { a, b }) {
  const ta = (a.touched || {})[at] || '';
  const tb = (b.touched || {})[at] || '';
  const fromA = newer(ta, tb);
  const src = fromA ? a : b;
  const val = pathValue(src, at);
  // Отметки нет на победившей стороне — значит, её там стёрли.
  if (val === undefined) return undefined;
  return clone(val);
}

/** Значение по пути вида «habits[hb1].log.2026-08-30». */
function pathValue(state, path) {
  let node = state;
  for (const step of path.split('.')) {
    if (node == null) return undefined;
    const m = step.match(/^(\w+)\[([^\]]+)\]$/);
    if (m) {
      node = node[m[1]];
      node = Array.isArray(node) ? node.find(x => idOf(x) === m[2]) : undefined;
    } else {
      node = node[step];
    }
  }
  return node;
}

/**
 * Слияние списка записей: объединяем по именам, у общих берём ту, что правили
 * позже, и убираем убитые следом. Порядок берём у победившей записи.
 */
function mergeList(mine, theirs, all) {
  const byId = new Map();
  const put = rec => {
    const id = idOf(rec);
    if (!id) return;
    const was = byId.get(id);
    if (!was || newer(rec.updatedAt, was.updatedAt)) byId.set(id, rec);
  };
  (Array.isArray(mine) ? mine : []).forEach(put);
  (Array.isArray(theirs) ? theirs : []).forEach(put);

  const out = [];
  for (const [id, rec] of byId) {
    // Удаление старше последней правки — значит, запись успели вернуть.
    const kill = newer(killedAt(all.a, id), '') || newer(killedAt(all.b, id), '')
      ? [killedAt(all.a, id), killedAt(all.b, id)].sort().pop() : '';
    if (kill && !newer(rec.updatedAt, kill)) continue;
    out.push(clone(rec));
  }
  out.sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0));
  return out;
}
