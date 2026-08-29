// «Я»: всё на этом экране посчитано из реальных отметок, ничего не зашито.

import { S, update } from '../store.js';
import { TRAITS, GROUPS, byId, hasTrait, effects, nameOf } from '../traits.js';
import { titleFor } from '../traits.js';
import { todayISO, monthKey, MONTHS, yearOf, addDays } from '../dates.js';
import { h, raw, bar, toast, openSheet, field } from '../ui.js';
import { AVATARS, avatarSrc, avatarHtml } from '../avatars.js';
import { levelInfo, needs, roles, pearl, weekStats, monthGoals, goalProgress, energyStats, dayLoad, restLine,
  sleepAvg, sleepMarks, sleepVsEnergy } from '../selectors.js';

export function render() {
  const li = levelInfo();
  const show = effects().show;
  const t = todayISO();
  const year = S.years[yearOf(t)];
  const goals = monthGoals(monthKey(t));
  const chapterPct = goals.length ? Math.round(goals.reduce((a, g) => a + goalProgress(g), 0) / goals.length) : 0;
  const w = weekStats(t);
  const prev = weekStats(addDays(t, -7));
  const need = needs();
  const rls = roles();
  const lonely = rls.find(r => r.low);

  return h`
    <div class="row" style="gap:12px">
      <button data-act="avatar" aria-label="Сменить аватар">${raw(avatarHtml(S.user, 58))}</button>
      <div class="grow">
        <div class="title" style="font-size:21px">${S.user.name || 'Персонаж'}</div>
        <div class="caps">${titleFor(li.lv)} · ур. ${li.lv}</div>
      </div>
      <button class="q-edit" data-act="edit">изменить ›</button>
    </div>


    <div class="card">
      <div class="row between"><div class="caps">${titleFor(li.lv)}</div>
        <span class="lab">${show === 'visual' ? '✦'.repeat(Math.min(5, li.lv)) : `${li.xp} XP`}</span></div>
      ${raw(bar(li.pct))}
      <div class="lab">${show === 'visual'
        ? `Уровень ${li.lv}. Опыт копится сам — считать не обязательно.`
        : `До ${li.lv + 1} уровня — ${Math.max(0, li.to - li.xp)} XP. Опыт только копится и не сгорает.`}</div>
    </div>

    ${raw(traitShelf())}

    <div class="card">
      <div class="caps">Потребности · 7 дней</div>
      ${need.map(n => raw(n.value == null
        // Без данных показываем одну подсказку: раньше рядом стояли «нет данных»
        // и длинный хвост, и на узком экране они налезали друг на друга.
        ? h`<div class="row"><span class="lab" style="width:74px">${n.name}</span>
             <span class="lab grow">${n.hint}</span></div>`
        : h`<div class="row"><span class="lab" style="width:74px">${n.name}</span>
             ${raw(bar(n.value, n.value < 45))}
             <span class="lab">${show === 'visual' ? pips(n.value) : n.value + '%'}</span></div>`))}
    </div>

    <div class="card">
      <div class="caps">Глава сейчас</div>
      <div class="ink"><b>${MONTHS[Number(monthKey(t).slice(5, 7)) - 1]}${year?.theme ? ` · «${year.theme}»` : ''}</b></div>
      ${goals.length ? raw(h`<div class="row">${raw(bar(chapterPct))}<span class="lab">${chapterPct}%</span></div>
        <div class="lab">${goals.map(g => g.title).join(' · ')}</div>`)
        : raw('<div class="lab">Целей на месяц пока нет — их можно завести в Планах.</div>')}
      <div class="lab">Неделя: закрыто ${w.done} из ${w.total}${show === 'numbers' ? ` · было ${prev.done} из ${prev.total}` : ''}</div>
    </div>

    ${raw(energyCard())}

    <div class="card">
      <div class="caps">Жемчужина дня</div>
      <div class="ink">${pearl()}</div>
    </div>

    <div class="card">
      <div class="caps">Круг ролей</div>
      <div class="grid2">
        ${rls.map(r => raw(h`
          <button class="role" data-act="role" data-v="${r.name}">
            <span class="ink">${r.name}</span>
            <span class="tag" ${raw(r.low ? 'style="background:#a63a35;color:#fff6ee"' : '')}>${r.state}${r.n ? ` · ${r.n}` : ''}</span>
          </button>`))}
      </div>
      <div class="lab">Считается всё отмеченное за 14 дней: квесты, тренировки, занятия, пары, операции, книги. Тапни роль — покажу, что засчиталось.</div>
    </div>

    ${lonely ? raw(h`<div class="ai">${lonely.name} две недели без дела. Открыть чат — соберём одно маленькое действие?
      <div class="pills" style="margin-top:8px"><button class="pill" data-act="chat" style="background:rgba(255,255,255,.9)">Открыть чат</button></div></div>`) : ''}
    <div style="height:4px"></div>`;
}

/** Пять делений вместо числа: для тех, кому счётчик мешает. */
const pips = v => '●'.repeat(Math.round((v || 0) / 20)) + '○'.repeat(5 - Math.round((v || 0) / 20));

/** Полка черт: полученные и ещё закрытые, с подсказкой, как их получить. */
function traitShelf() {
  const open = S.ui.traitsOpen;
  const owned = TRAITS.filter(t => hasTrait(t.id));
  const locked = TRAITS.filter(t => t.source === 'observed' && !hasTrait(t.id));

  return h`
    <div class="card">
      <div class="row between">
        <div class="caps">Черты · ${owned.length} из ${TRAITS.length}</div>
        <button class="q-edit" data-act="traits">${open ? 'свернуть' : 'все ›'}</button>
      </div>
      <div class="pills">
        ${owned.map(t => raw(h`<span class="pill on" title="${t.does || t.desc}">${t.icon} ${nameOf(t)}</span>`))}
      </div>
      ${open ? raw(h`
        ${Object.entries(GROUPS).map(([key, g]) => {
          const list = TRAITS.filter(t => t.group === key);
          return raw(h`
            <div class="lab" style="margin-top:6px">${g.name}</div>
            ${list.map(t => raw(h`
              <div class="row between" style="opacity:${hasTrait(t.id) ? 1 : 0.5}">
                <span class="ink grow">${t.icon} ${nameOf(t)}</span>
                <span class="lab" style="max-width:56%;text-align:right">${hasTrait(t.id) ? (t.does || t.desc) : (t.how || t.desc)}</span>
              </div>`))}`);
        })}
        <div class="lab">Черты из тестов и профиля меняются вместе с ними. Заработанные не отбираются.</div>`)
      : raw(h`<div class="lab">${locked.length ? `Ещё ${locked.length} можно заработать.` : 'Все заработанные черты собраны.'}</div>`)}
    </div>`;
}

/** Связки энергии — то, ради чего её вообще стоит отмечать. */
function energyCard() {
  const e = energyStats();
  if (!e.count) return '';
  if (e.count < 5) return h`
    <div class="card mute">
      <div class="caps">Энергия</div>
      <div class="lab">Отмечено ${e.count} ${e.count === 1 ? 'день' : 'дня'}. Связки с циклом и занятиями появятся дней через пять.</div>
    </div>`;

  const diff = e.move.avg != null && e.still.avg != null ? e.move.avg - e.still.avg : null;
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Энергия · 90 дней</div><span class="lab">в среднем ${e.avg}</span></div>

      ${e.phases.length > 1 ? raw(h`
        <div class="lab">По фазам цикла</div>
        ${e.phases.map(p => raw(h`<div class="row">
          <span class="lab" style="width:104px">${p.name}</span>
          ${raw(bar(p.avg, p.avg < e.avg - 8))}
          <span class="lab">${p.avg}</span></div>`))}`) : ''}

      ${e.move.n && e.still.n ? raw(h`
        <div class="lab" style="margin-top:4px">В дни с занятиями и без</div>
        <div class="row"><span class="lab" style="width:104px">с движением</span>${raw(bar(e.move.avg))}<span class="lab">${e.move.avg}</span></div>
        <div class="row"><span class="lab" style="width:104px">без</span>${raw(bar(e.still.avg))}<span class="lab">${e.still.avg}</span></div>
        <div class="lab">${diff > 4 ? `В дни с движением энергия выше на ${diff}.`
          : diff < -4 ? `В дни с движением энергия ниже на ${-diff} — возможно, это дни усталости.`
          : 'Разницы почти нет.'}</div>`) : ''}

      ${raw(sleepLine())}

      <div class="lab">Считается из твоих отметок за 90 дней — ${e.count} ${e.count % 10 === 1 && e.count % 100 !== 11 ? 'день' : 'дней'}.</div>
    </div>`;
}

/**
 * Сон рядом с энергией: сравниваем дни, когда спалось не меньше нормы, и
 * дни, когда меньше. Пока ночей с любой стороны меньше трёх, связь не
 * показываем — на двух ночах это была бы выдумка, а не наблюдение.
 */
function sleepLine() {
  const v = sleepVsEnergy();
  if (!v) return '';
  const d = v.long - v.short;
  return h`
    <div class="lab" style="margin-top:4px">В зависимости от сна</div>
    <div class="row"><span class="lab" style="width:104px">от ${v.norm} ч</span>${raw(bar(v.long))}<span class="lab">${v.long}</span></div>
    <div class="row"><span class="lab" style="width:104px">меньше</span>${raw(bar(v.short))}<span class="lab">${v.short}</span></div>
    <div class="lab">${d > 4 ? `Выспавшись, ты в среднем бодрее на ${d}.`
      : d < -4 ? `После долгого сна энергия ниже на ${-d} — так тоже бывает.`
      : 'Разницы почти нет.'} ${v.nLong} и ${v.nShort} ${v.nShort === 1 ? 'ночь' : 'ночей'} соответственно.</div>`;
}

export const actions = {
  avatar: () => avatarSheet(),
  role: v => roleSheet(roles().find(r => r.name === v.v)),
  traits: () => update(s => { s.ui.traitsOpen = !s.ui.traitsOpen; }),
  chat: () => { location.hash = '#/inside/chat'; },
  edit: () => profileSheet(),
};

/** Что именно засчиталось роли: по каждому источнику своя строка. */
function roleSheet(r) {
  if (!r) return;
  openSheet({
    title: r.name,
    sub: `${r.state} · за ${r.window} дней`,
    body: [
      r.parts.length
        ? r.parts.map(p => h`<div class="row between"><span class="lab grow">${p.label}</span><span class="ink">${p.n}</span></div>`).join('')
        : '<p class="fld-note">За две недели по этой роли нет ни одной отметки.</p>',
      field.note('Считаются только события с датой. Этап сферы, закрытый до этого обновления, в счёт не попадёт — времени у него не записано.'),
    ].join(''),
  });
}

/** «Персонаж»: имя, хронотип, сон и строка аватара. */
function profileSheet() {
  openSheet({
    title: 'Персонаж',
    body: [
      h`<button class="row between av-row" data-act="avatar">
          <span class="lab grow" style="text-align:left">Аватар</span>
          ${raw(avatarHtml(S.user, 34))}
          <span class="lab">сменить ›</span>
        </button>`,
      field.text('name', 'Имя', S.user.name),
      field.opts('sex', 'Пол', [{ value: 'f', label: 'Женский' }, { value: 'm', label: 'Мужской' }], S.user.sex),
      field.date('birth', 'Дата рождения', S.user.birth || ''),
      field.opts('chronotype', 'Хронотип', ['жаворонок', 'сова', 'плавает'], S.user.chronotype),
      field.range('sleep', 'Нужно спать', S.user.sleep, { min: 6, max: 11, step: 0.5, suffix: ' ч' }),
      field.number('height', 'Рост', S.user.height || '', { min: 0, max: 260, suffix: 'см' }),
      field.number('wrist', 'Обхват запястья', S.user.wrist || '', { min: 0, max: 30, suffix: 'см' }),
      `<label class="row tight" style="font-size:13px"><input type="checkbox" name="cycle" ${S.user.cycle ? 'checked' : ''}> Вести цикл в «Теле»</label>`,
      field.note('Пол меняет обращение и нормы, которые считаются по-разному у мужчин и женщин: расход калорий, порог талии, тип сложения. Цикл — отдельный тумблер: выключишь — раздел скроется, отметки останутся.'),
    ].join(''),
    // Кнопка аватара живёт внутри шторки, поэтому её ловит сама шторка.
    onAct: (name, _data, close, typed) => {
      if (name !== 'avatar') return;
      // Заполненное не теряем: сохраняем всё, а не одно имя, — иначе поход
      // за аватаром откатывал бы рост, дату рождения и остальное.
      if (typed) update(s => saveProfile(s, typed));
      close();
      avatarSheet(profileSheet);
    },
    onSave: (v, close) => {
      update(s => saveProfile(s, v));
      close();
      toast('Сохранено');
    },
  });
}

/** Поля профиля из шторки в состояние. Одно место — и сохранение, и уход за аватаром. */
function saveProfile(s, v) {
  s.user.name = (v.name || '').trim() || s.user.name;
  s.user.sex = v.sex === 'm' ? 'm' : 'f';
  s.user.birth = v.birth || '';
  s.user.chronotype = v.chronotype || s.user.chronotype;
  s.user.sleep = Number(v.sleep) || s.user.sleep;
  s.user.height = Math.max(0, Number(v.height) || 0);
  s.user.wrist = Math.max(0, Number(v.wrist) || 0);
  s.user.cycle = !!v.cycle;
}

/** Мини-окно выбора: буква имени и полсотни портретов. */
function avatarSheet(back) {
  const cur = S.user.avatar || '';
  openSheet({
    title: 'Аватар',
    sub: 'выбери, кто смотрит на тебя с экрана',
    body: h`
      <div class="av-grid">
        <button class="av-pick ${cur === '' ? 'on' : ''}" data-act="pick" data-v="" aria-label="Буква имени">
          ${raw(avatarHtml({ ...S.user, avatar: '' }, 58))}
        </button>
        ${AVATARS.map((id, i) => raw(h`
          <button class="av-pick ${cur === id ? 'on' : ''}" data-act="pick" data-v="${id}" aria-label="Аватар ${i + 1}">
            <img src="${avatarSrc(id)}" alt="" loading="lazy">
          </button>`))}
      </div>`,
    onAct: (name, data, close) => {
      if (name !== 'pick') return;
      update(s => { s.user.avatar = data.v; });
      close();
      if (back) back();
    },
    onSave: null,
    secondary: back ? 'Назад' : 'Закрыть',
    onSecondary: (_v, close) => { close(); if (back) back(); },
  });
}
