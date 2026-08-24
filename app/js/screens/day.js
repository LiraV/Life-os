// «День»: реальные даты, энергия дня, квесты с полным редактированием.

import { S, update, uid, XP, addXp, SPHERES, addDiary } from '../store.js';
import { todayISO, addDays, dayTitle, dayShort, relativeDay } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import {
  questsOn, energyCurve, ENERGY_BLOCKS, energyLabel, peakBlock, chronicler, sphereOf,
  liveGoals, goalChain, liveHabits, habitTarget, habitCount, habitDone,
} from '../selectors.js';

const curDate = () => S.ui.date || todayISO();

/** Текущий блок кривой энергии по часам; ночью (1–7) — вне блоков. */
function nowBlock() {
  const hh = new Date().getHours();
  if (hh >= 7 && hh < 10) return 0;
  if (hh < 13) return 1;
  if (hh < 16) return 2;
  if (hh < 19) return 3;
  if (hh < 22) return 4;
  if (hh >= 22 || hh < 1) return 5;
  return -1;
}

export const defaultEnergy = date => S.energy[date] ?? energyCurve()[Math.max(0, nowBlock())] ?? 60;

export function render() {
  const date = curDate();
  const qs = questsOn(date);
  const isToday = date === todayISO();
  const e = defaultEnergy(date);
  const curve = energyCurve();
  const peak = peakBlock();
  const nb = isToday ? nowBlock() : -1;
  const done = qs.filter(q => q.done).length;

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev" aria-label="Предыдущий день">‹</button>
      <div style="text-align:center">
        <div class="title">${dayTitle(date)}</div>
        <div class="lab">${relativeDay(date) || dayShort(date)}${qs.length ? ` · ${done} из ${qs.length}` : ''}</div>
      </div>
      <button class="arrow" data-act="next" aria-label="Следующий день">›</button>
    </div>
    ${!isToday ? raw('<button class="btn-ghost" data-act="today">вернуться к сегодня</button>') : ''}

    <div class="card">
      <div class="row between"><div class="lab">Кривая дня · ${S.user.chronotype}</div><div class="lab">пик ${ENERGY_BLOCKS[peak]}</div></div>
      <div class="curve">
        ${curve.map((v, i) => raw(h`<div class="${i === peak ? 'hot' : ''} ${i === nb ? 'now' : ''}" style="height:${Math.max(8, v)}%"></div>`))}
      </div>
      <div class="curve-x">${ENERGY_BLOCKS.map(b => raw(h`<span>${b}</span>`))}</div>
      <div class="fld" style="margin-top:2px">
        <span>Энергия сейчас <b id="e_out">${e} · ${energyLabel(e)}</b></span>
        <input type="range" min="0" max="100" value="${e}" data-field="energy" data-change="energy" data-live="e_out" aria-label="Энергия">
      </div>
    </div>

    <div class="row between"><div class="caps">Квесты дня</div>
      ${qs.length ? raw('<button class="q-edit" data-act="add">+ квест</button>') : ''}</div>

    ${qs.length ? qs.map(q => raw(questRow(q))) : raw(h`
      <div class="card dash"><div class="empty">На этот день пусто.<br>Одно дело — уже достаточно.</div>
        <button class="add" data-act="add">+ Добавить квест</button></div>`)}

    ${raw(habitsBlock(date))}

    ${chronicler(date).map(t => raw(h`<div class="ai">${t}</div>`))}
    <div style="height:4px"></div>`;
}

/** Ритм дня прямо на главном: норма, счёт и плюс в один тап. */
function habitsBlock(date) {
  const list = liveHabits();
  if (!list.length) return h`
    <div class="card dash">
      <div class="row between"><div class="caps">Ритм дня</div>
        <button class="q-edit" data-act="habits">завести ›</button></div>
      <div class="lab">Привычек пока нет. Одной достаточно, чтобы начать.</div>
    </div>`;

  const done = list.filter(hb => habitDone(hb, date)).length;
  const future = date > todayISO();
  return h`
    <div class="card">
      <div class="row between">
        <div class="caps">Ритм дня</div>
        <span class="lab">${done} из ${list.length}${raw(' · ')}<span data-act="habits" style="cursor:pointer">все ›</span></span>
      </div>
      ${list.map(hb => {
        const target = habitTarget(hb);
        const c = habitCount(hb, date);
        const full = c >= target;
        return raw(h`
          <div class="hab-row ${full ? 'done' : ''}">
            <div class="grow">
              <div class="ink">${hb.name}</div>
              <div class="lab">${c} / ${target}${hb.unit ? ' ' + hb.unit : ''}</div>
            </div>
            ${full
              ? raw(h`<button class="hab-plus on" data-act="hab" data-id="${hb.id}" aria-label="Сбросить">✓</button>`)
              : raw(h`<button class="hab-plus" data-act="hab" data-id="${hb.id}" ${raw(future ? 'disabled' : '')} aria-label="Отметить">+</button>`)}
          </div>`);
      })}
    </div>`;
}

function questRow(q) {
  const sp = sphereOf(q.sphere);
  return h`
    <div class="quest ${q.done ? 'done' : ''}">
      <button class="check ${q.done ? 'on' : ''}" data-act="toggle" data-id="${q.id}" aria-label="Выполнено">✓</button>
      <div class="grow" data-act="edit" data-id="${q.id}" style="cursor:pointer">
        <div class="q-title">${q.title}</div>
        <div class="q-meta">
          ${q.time ? raw(h`<span class="q-time">${q.time}${q.minutes ? ` · ${q.minutes} мин` : ''}</span>`) : ''}
          ${sp ? raw(h`<span class="tag">${sp.name}</span>`) : ''}
          ${q.boss ? raw('<span class="tag boss">босс ★</span>') : ''}
        </div>
      </div>
      <button class="q-edit" data-act="edit" data-id="${q.id}">настроить ›</button>
    </div>`;
}

// ── редактор квеста ─────────────────────────────────────────────
const SPHERE_OPTS = [{ value: '', label: 'без сферы' }, ...SPHERES.map(s => ({ value: s.key, label: s.name }))];

export function questSheet(quest, date, onDone) {
  const isNew = !quest;
  const q = quest || { id: uid(), title: '', time: '', minutes: 45, sphere: '', boss: false, goalId: '', done: false };
  const goals = liveGoals();
  const chain = q.goalId ? goalChain(q.goalId) : null;

  openSheet({
    title: isNew ? 'Новый квест' : 'Квест',
    body: [
      field.text('title', 'Что делаем', q.title, 'например, «Черновик главы 2»'),
      field.time('time', 'Когда', q.time),
      field.opts('minutes', 'Длина', [{ value: '45', label: '45 мин' }, { value: '90', label: '90 мин' }, { value: '120', label: '120 мин' }], String(q.minutes || 45)),
      field.opts('sphere', 'Сфера', SPHERE_OPTS, q.sphere || ''),
      goals.length
        ? field.select('goalId', 'Зачем — ведёт к цели', [{ value: '', label: 'просто так' }, ...goals.map(g => ({ value: g.id, label: g.title }))], q.goalId || '')
        : field.note('Целей пока нет — связь «зачем» появится, когда добавишь цель в Планах.'),
      chain && chain.links.length
        ? field.note('→ ' + chain.links.map(l => l.title).join(' → ') + (chain.theme ? ` → «${chain.theme}»` : ''))
        : '',
      field.date('date', 'День', date),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="boss" ${q.boss ? 'checked' : ''}> Это босс недели ★</label>`,
    ].join(''),
    primary: isNew ? 'Добавить' : 'Сохранить',
    onSave: (v, close) => {
      const title = (v.title || '').trim();
      if (!title) return toast('Без названия не сохранится');
      const target = v.date || date;
      update(s => {
        // Удаляем из старого дня — квест мог переехать на другую дату.
        Object.keys(s.quests).forEach(d => { s.quests[d] = s.quests[d].filter(x => x.id !== q.id); });
        const next = { ...q, title, time: v.time || '', minutes: Number(v.minutes) || 45, sphere: v.sphere || '', goalId: v.goalId || '', boss: !!v.boss };
        (s.quests[target] ||= []).push(next);
        s.quests[target].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
        if (target !== date) s.ui.date = target;
      });
      close();
      toast(isNew ? 'Квест добавлен' : 'Сохранено');
      onDone?.();
    },
    danger: isNew ? null : 'Удалить квест',
    onDanger: (_v, close) => {
      update(s => { Object.keys(s.quests).forEach(d => { s.quests[d] = s.quests[d].filter(x => x.id !== q.id); }); });
      close();
      toast('Удалено — без вины');
    },
  });
}

// ── рефлексия после занятия ─────────────────────────────────────
function reflectionSheet(q) {
  openSheet({
    title: 'Как оно?',
    sub: q.title,
    body: [
      field.opts('body', 'Тело', ['устала', 'приятная усталость', 'лёгкость'], 'приятная усталость'),
      field.opts('mood', 'Настроение', ['наполнилась', 'ровно', 'не зашло'], 'ровно'),
      field.area('note', 'Заметка — если хочется', ''),
    ].join(''),
    primary: 'Сохранить · +8 XP',
    onSave: (v, close) => {
      update(s => {
        addDiary(s, `тело: ${v.body} · настроение: ${v.mood}${v.note ? ` — ${v.note}` : ''}`, `после «${q.title}»`, 'reflection');
        addXp(XP.reflection);
      });
      close();
      toast('Записала в дневник');
    },
    secondary: 'пропустить — ничего не случится',
    onSecondary: (_v, close) => close(),
  });
}

export const actions = {
  prev: () => update(s => { s.ui.date = addDays(curDate(), -1); }),
  next: () => update(s => { s.ui.date = addDays(curDate(), 1); }),
  today: () => update(s => { s.ui.date = todayISO(); }),

  energy: v => update(s => { s.energy[curDate()] = Number(v.value); }),

  toggle: v => {
    const date = curDate();
    let flipped = null;
    update(s => {
      const q = (s.quests[date] || []).find(x => x.id === v.id);
      if (!q) return;
      q.done = !q.done;
      q.doneAt = q.done ? new Date().toISOString() : null;
      addXp(q.done ? (q.boss ? XP.boss : XP.quest) : -(q.boss ? XP.boss : XP.quest));
      flipped = q;
    });
    if (!flipped) return;
    if (flipped.done && flipped.boss) toast('Босс повержен ✦');
    else if (flipped.done) toast(`+${XP.quest} XP`);
    if (flipped.done && flipped.sphere === 'sport') setTimeout(() => reflectionSheet(flipped), 350);
  },

  habits: () => { location.hash = '#/habits'; },

  /** Плюс добавляет один раз, галочка на закрытой норме обнуляет день. */
  hab: v => {
    const date = curDate();
    if (date > todayISO()) return;
    let reached = false, name = '';
    update(s => {
      const hb = s.habits.find(x => x.id === v.id);
      if (!hb) return;
      const target = Math.max(1, Number(hb.target) || 1);
      const was = Math.max(0, Number(hb.log[date]) || 0);
      const next = was >= target ? 0 : was + 1;
      if (next) hb.log[date] = next; else delete hb.log[date];
      if (next >= target && was < target) { addXp(XP.habit); reached = true; name = hb.name; }
      if (was >= target && next < target) addXp(-XP.habit);
    });
    if (reached) toast(`${name} — норма закрыта ✦`);
  },

  edit: v => {
    const q = questsOn(curDate()).find(x => x.id === v.id);
    if (q) questSheet(q, curDate());
  },
  add: () => questSheet(null, curDate()),
};
