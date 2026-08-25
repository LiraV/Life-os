// «Я»: всё на этом экране посчитано из реальных отметок, ничего не зашито.

import { S, update } from '../store.js';
import { TRAITS, GROUPS, byId, hasTrait, effects } from '../traits.js';
import { titleFor } from '../traits.js';
import { todayISO, monthKey, MONTHS, yearOf, addDays } from '../dates.js';
import { h, raw, bar, toast, openSheet, field } from '../ui.js';
import { AVATARS, avatarSrc, avatarHtml } from '../avatars.js';
import { levelInfo, needs, roles, pearl, weekStats, monthGoals, goalProgress, energyStats, dayLoad, restLine } from '../selectors.js';

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

    ${S.ui.avatarOpen ? raw(avatarGrid()) : ''}

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
          <div class="role">
            <span class="ink">${r.name}</span>
            <span class="tag" ${raw(r.low ? 'style="background:#a63a35;color:#fff6ee"' : '')}>${r.state}</span>
          </div>`))}
      </div>
      <div class="lab">Состояние — из закрытых квестов за 14 дней.</div>
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
        ${owned.map(t => raw(h`<span class="pill on" title="${t.does || t.desc}">${t.icon} ${t.name}</span>`))}
      </div>
      ${open ? raw(h`
        ${Object.entries(GROUPS).map(([key, g]) => {
          const list = TRAITS.filter(t => t.group === key);
          return raw(h`
            <div class="lab" style="margin-top:6px">${g.name}</div>
            ${list.map(t => raw(h`
              <div class="row between" style="opacity:${hasTrait(t.id) ? 1 : 0.5}">
                <span class="ink grow">${t.icon} ${t.name}</span>
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

      <div class="lab">Считается из твоих отметок за 90 дней — ${e.count} ${e.count % 10 === 1 && e.count % 100 !== 11 ? 'день' : 'дней'}.</div>
    </div>`;
}

export const actions = {
  avatar: () => update(s => { s.ui.avatarOpen = !s.ui.avatarOpen; }),
  pick: v => update(s => { s.user.avatar = v.v; s.ui.avatarOpen = false; }),
  traits: () => update(s => { s.ui.traitsOpen = !s.ui.traitsOpen; }),
  chat: () => { location.hash = '#/inside/chat'; },
  edit: () => openSheet({
    title: 'Персонаж',
    body: [
      field.text('name', 'Имя', S.user.name),
      field.opts('chronotype', 'Хронотип', ['жаворонок', 'сова', 'плавает'], S.user.chronotype),
      field.range('sleep', 'Нужно спать', S.user.sleep, { min: 6, max: 11, step: 0.5, suffix: ' ч' }),
    ].join(''),
    onSave: (v, close) => {
      update(s => {
        s.user.name = (v.name || '').trim() || s.user.name;
        s.user.chronotype = v.chronotype || s.user.chronotype;
        s.user.sleep = Number(v.sleep) || s.user.sleep;
      });
      close();
      toast('Сохранено');
    },
  }),
};

/** Выбор аватара прямо на экране: пять портретов и буква имени как было. */
function avatarGrid() {
  const cur = S.user.avatar || '';
  return h`
    <div class="card">
      <div class="row between"><div class="caps">Аватар</div>
        <button class="q-edit" data-act="avatar">свернуть</button></div>
      <div class="av-grid">
        <button class="av-pick ${cur === '' ? 'on' : ''}" data-act="pick" data-v="">
          ${raw(avatarHtml({ ...S.user, avatar: '' }, 62))}
          <span class="lab">Буква</span>
        </button>
        ${AVATARS.map(a => raw(h`
          <button class="av-pick ${cur === a.id ? 'on' : ''}" data-act="pick" data-v="${a.id}">
            <img src="${avatarSrc(a.id)}" alt="${a.name}" loading="lazy">
            <span class="lab">${a.name}</span>
          </button>`))}
      </div>
    </div>`;
}
