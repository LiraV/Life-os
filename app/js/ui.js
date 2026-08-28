// Мелкий UI-слой: экранирование, шторки, тосты, поля форм.
// Никаких зависимостей — шаблонные строки плюс делегирование событий.

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const raw = v => ({ __raw: String(v ?? '') });

/** Шаблонный тег: значения экранируются, массивы склеиваются, raw() пропускается как есть. */
export function h(strings, ...vals) {
  return strings.reduce((acc, str, i) => {
    if (i === 0) return str;
    const v = vals[i - 1];
    const piece = v == null || v === false ? ''
      : Array.isArray(v) ? v.map(x => (x && x.__raw !== undefined ? x.__raw : esc(x))).join('')
      : v.__raw !== undefined ? v.__raw
      : esc(v);
    return acc + piece + str;
  }, '');
}

// ── тост ────────────────────────────────────────────────────────
let toastTimer = null;
export function toast(text) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  el.setAttribute('role', 'status');
  document.querySelector('.app').appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

// ── шторка ──────────────────────────────────────────────────────
let sheetEl = null;

export function closeSheet() {
  if (!sheetEl) return;
  sheetEl.remove();
  sheetEl = null;
  document.removeEventListener('keydown', onEsc);
}

function onEsc(e) { if (e.key === 'Escape') closeSheet(); }

/**
 * Нижняя шторка с формой. body — HTML с полями (см. field.*).
 * onSave получает объект значений по name и функцию закрытия.
 */
export function openSheet({ title, sub, body = '', primary = 'Сохранить', onSave, secondary, onSecondary, danger, onDanger, onAct }) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = h`
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${title || 'Шторка'}">
      <div class="grab"></div>
      ${title ? raw(h`<div class="sheet-title">${title}</div>`) : ''}
      ${sub ? raw(h`<div class="sheet-sub">${sub}</div>`) : ''}
      <div class="sheet-body">${raw(body)}</div>
      <div class="sheet-actions">
        ${onSave ? raw(h`<button class="btn" data-sheet="save">${primary}</button>`) : ''}
        ${secondary ? raw(h`<button class="btn-ghost" data-sheet="secondary">${secondary}</button>`) : ''}
        ${danger ? raw(h`<button class="btn-ghost danger" data-sheet="danger">${danger}</button>`) : ''}
        <button class="btn-ghost" data-sheet="close">Закрыть — без вопросов и вины</button>
      </div>
    </div>`;
  document.querySelector('.app').appendChild(wrap);
  sheetEl = wrap;
  document.addEventListener('keydown', onEsc);

  const values = () => {
    const out = {};
    wrap.querySelectorAll('[name]').forEach(el => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else out[el.name] = el.value;
    });
    return out;
  };

  wrap.addEventListener('click', e => {
    if (e.target === wrap) return closeSheet();
    const pill = e.target.closest('.opt');
    if (pill && wrap.contains(pill)) {
      const group = pill.closest('.opts');
      group.querySelectorAll('.opt').forEach(p => p.classList.toggle('on', p === pill));
      group.querySelector('input[type=hidden]').value = pill.dataset.value;
      group.dispatchEvent(new CustomEvent('opt', { detail: pill.dataset.value, bubbles: true }));
      return;
    }
    // Своя кнопка внутри шторки: экранные действия сюда не долетают,
    // поэтому шторка отдаёт их тому, кто её открыл.
    const own = e.target.closest('[data-act]');
    // Введённое отдаём вместе с действием: если шторка уходит и вернётся,
    // ей есть что сохранить, и заполненное не пропадает.
    if (own && onAct) { onAct(own.dataset.act, { ...own.dataset }, closeSheet, values()); return; }
    const act = e.target.closest('[data-sheet]');
    if (!act) return;
    const kind = act.dataset.sheet;
    if (kind === 'close') closeSheet();
    if (kind === 'save' && onSave) onSave(values(), closeSheet, wrap);
    if (kind === 'secondary' && onSecondary) onSecondary(values(), closeSheet, wrap);
    if (kind === 'danger' && onDanger) onDanger(values(), closeSheet, wrap);
  });

  wrap.addEventListener('input', e => {
    const r = e.target.closest('input[type=range][data-live]');
    if (r) { const out = wrap.querySelector('#' + r.dataset.live); if (out) out.textContent = r.dataset.suffix ? r.value + r.dataset.suffix : r.value; }
  });

  const first = wrap.querySelector('input[type=text], textarea');
  if (first) setTimeout(() => first.focus(), 60);
  return wrap;
}

export function confirmSheet(title, sub, primary, onYes) {
  openSheet({ title, sub, primary, onSave: (_v, close) => { onYes(); close(); } });
}

// ── поля формы ──────────────────────────────────────────────────
export const field = {
  text: (name, label, value = '', placeholder = '') => h`
    <label class="fld"><span>${label}</span>
      <input type="text" name="${name}" value="${value}" placeholder="${placeholder}" autocomplete="off"></label>`,

  area: (name, label, value = '', placeholder = '') => h`
    <label class="fld"><span>${label}</span>
      <textarea name="${name}" rows="3" placeholder="${placeholder}">${value}</textarea></label>`,

  number: (name, label, value = '', { min, max, step = 'any', suffix = '' } = {}) => h`
    <label class="fld"><span>${label}${suffix ? raw(h`<i>${suffix}</i>`) : ''}</span>
      <input type="number" name="${name}" value="${value}" ${raw(min != null ? `min="${min}"` : '')} ${raw(max != null ? `max="${max}"` : '')} step="${step}" inputmode="decimal"></label>`,

  date: (name, label, value = '') => h`
    <label class="fld"><span>${label}</span><input type="date" name="${name}" value="${value}"></label>`,
  month: (name, label, value = '') => h`
    <label class="fld"><span>${label}</span><input type="month" name="${name}" value="${value}"></label>`,

  time: (name, label, value = '') => h`
    <label class="fld"><span>${label}</span><input type="time" name="${name}" value="${value}"></label>`,

  select: (name, label, options, value) => h`
    <label class="fld"><span>${label}</span>
      <select name="${name}">
        ${options.map(o => raw(h`<option value="${o.value}" ${raw(o.value === value ? 'selected' : '')}>${o.label}</option>`))}
      </select></label>`,

  /** Пилюли с одним выбором: значение кладётся в скрытый input. */
  opts: (name, label, options, value) => h`
    <div class="fld"><span>${label}</span>
      <div class="opts" data-name="${name}">
        <input type="hidden" name="${name}" value="${value ?? ''}">
        ${options.map(o => {
          const val = typeof o === 'string' ? o : o.value;
          const lab = typeof o === 'string' ? o : o.label;
          return raw(h`<button type="button" class="opt ${val === value ? 'on' : ''}" data-value="${val}">${lab}</button>`);
        })}
      </div></div>`,

  range: (name, label, value, { min = 0, max = 100, step = 1, suffix = '', left = '', right = '' } = {}) => {
    const id = 'o_' + name;
    return h`
      <div class="fld"><span>${label} <b id="${id}">${String(value) + suffix}</b></span>
        <input type="range" name="${name}" data-field="${name}" value="${value}" min="${min}" max="${max}" step="${step}" data-live="${id}" data-suffix="${suffix}">
        ${left || right ? raw(h`<div class="range-ends"><span>${left}</span><span>${right}</span></div>`) : ''}
      </div>`;
  },

  note: text => h`<p class="fld-note">${text}</p>`,
};

/** Снять значения всех полей [data-field] внутри узла — вызывается перед переходом,
 *  чтобы введённое не потерялось на перерисовке. */
export function collect(root) {
  const out = {};
  (root || document.getElementById('scr')).querySelectorAll('[data-field]').forEach(el => {
    out[el.dataset.field] = el.type === 'checkbox' ? el.checked
      : (el.type === 'range' || el.type === 'number') ? Number(el.value)
      : el.value;
  });
  return out;
}

/** Полоска прогресса. */
export const bar = (pct, hot = false) => h`<div class="bar"><i class="${hot ? 'hot' : ''}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
