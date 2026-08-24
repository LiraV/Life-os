// Онбординг: три шага, всё введённое реально сохраняется в профиль.
// Черновик живёт в S.ui.onb, поэтому шаги переживают закрытие вкладки.

import { S, update, uid, XP, addXp } from '../store.js';
import { todayISO, yearOf } from '../dates.js';
import { h, raw, field, toast, collect } from '../ui.js';
import { peakLabel } from '../selectors.js';

const SUGGESTED = ['Итальянский 15 минут', 'Вода 2 литра', 'Растяжка', 'Сон до 00:30', 'Страница дневника'];

const draft = () => (S.ui.onb ||= { step: 0, name: '', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55, habits: [], theme: '' });

function traits(d) {
  const t = [d.chronotype === 'сова' ? 'Сова' : d.chronotype === 'жаворонок' ? 'Жаворонок' : 'Плавающий ритм'];
  t.push(d.activity > 60 ? 'Спринтер' : 'Марафонец');
  t.push(d.introversion > 60 ? 'Нужна тишина' : 'Заряжаюсь от людей');
  return t;
}

export function render() {
  const d = draft();
  const step = d.step;
  const body = [step0, step1, step2][step](d);
  return h`
    <div class="statusline lab" style="flex:none">шаг ${step + 1} из 3</div>
    ${raw(body)}`;
}

const step0 = d => h`
  <div class="title big" style="margin-top:6px">Вся жизнь —<br>в одном месте</div>
  <div class="sub" style="font-size:14px">Ты — персонаж. Сферы — твоя игра.<br>Без стриков и чувства вины.</div>
  <img class="hero-img" style="height:220px" src="assets/illustration_01.png" alt="">
  <div class="card">
    <div class="ink"><b>Создаём персонажа</b></div>
    <div class="fld">
      <span>Как тебя звать</span>
      <input type="text" value="${d.name}" data-field="name" data-act-enter="next" placeholder="Имя" autocomplete="given-name">
    </div>
  </div>
  <div style="flex:1"></div>
  <button class="btn" data-act="next">Начать · 3 минуты</button>
  <button class="btn-ghost" data-act="skip">пропустить онбординг</button>`;

const step1 = d => h`
  <div class="title">Тело и ритм</div>
  <div class="sub">Из этого соберётся кривая энергии и время для тяжёлых задач.</div>
  <div class="card">
    ${raw(field.range('sleep', 'Сколько тебе нужно спать', d.sleep, { min: 6, max: 11, step: 0.5, suffix: ' ч' }))}
  </div>
  <div class="card">
    <div class="lab">Хронотип</div>
    <div class="pills">
      ${['жаворонок', 'сова', 'плавает'].map(c => raw(h`<button class="pill ${d.chronotype === c ? 'on' : ''}" data-act="chrono" data-v="${c}">${c[0].toUpperCase() + c.slice(1)}</button>`))}
    </div>
    <div class="lab">${d.chronotype === 'сова' ? 'Пик вечером — тяжёлое ставим на 19–22' : d.chronotype === 'жаворонок' ? 'Пик утром — тяжёлое ставим на 10–13' : 'Ритм плавающий — подстроюсь по факту'}</div>
  </div>
  <div class="card">
    ${raw(field.range('introversion', 'Интроверсия', d.introversion, { left: 'люди', right: 'тишина' }))}
    ${raw(field.range('activity', 'Активность', d.activity, { left: 'покой', right: 'движение' }))}
  </div>
  <div style="flex:1"></div>
  <button class="btn" data-act="next">Дальше →</button>
  <button class="btn-ghost" data-act="back">назад</button>`;

const step2 = d => h`
  <div class="title">Знакомься: ты</div>
  <div class="pills">${traits(d).map(t => raw(h`<span class="pill">${t}</span>`))}</div>
  <div class="card">
    <div class="ink"><b>Я уже подстроилось</b></div>
    <div class="lab">Фокус-блоки поставлю на ${peakLabelFor(d)} — это твой пик. Сон считаю от ${d.sleep} ч.</div>
  </div>
  <div class="card">
    <div class="ink"><b>С чего начнём ритм?</b></div>
    <div class="lab">Выбери привычки — их можно поменять в любой момент.</div>
    <div class="pills">
      ${SUGGESTED.map(s => raw(h`<button class="pill ${d.habits.includes(s) ? 'on' : ''}" data-act="hab" data-v="${s}">${s}</button>`))}
    </div>
  </div>
  <div class="card">
    <div class="fld"><span>Тема года — если уже знаешь</span>
      <input type="text" value="${d.theme}" data-field="theme" placeholder="например, «Свой голос»"></div>
  </div>
  <div class="ai">Дальше я учусь на твоих отметках: энергия, рефлексии, что переносится. Цели не меняю никогда — только предлагаю.</div>
  <div style="flex:1"></div>
  <button class="btn" data-act="finish">В первый день →</button>
  <button class="btn-ghost" data-act="back">назад</button>`;

function peakLabelFor(d) {
  const saved = S.user.chronotype;
  S.user.chronotype = d.chronotype;
  const label = peakLabel();
  S.user.chronotype = saved;
  return label;
}

function finish(skipped) {
  const d = draft();
  update(s => {
    s.user.name = (d.name || '').trim() || 'Персонаж';
    s.user.chronotype = d.chronotype;
    s.user.sleep = Number(d.sleep);
    s.user.introversion = Number(d.introversion);
    s.user.activity = Number(d.activity);
    s.user.traits = skipped ? [] : traits(d);
    s.habits = (skipped ? [] : d.habits).map(name => ({ id: uid(), name, target: 1, unit: '', log: {}, createdAt: todayISO() }));
    if (!skipped && d.theme.trim()) s.years[yearOf(todayISO())] = { theme: d.theme.trim(), quarters: {} };
    s.onboarded = true;
    s.ui.onb = null;
    addXp(XP.test);
  });
  location.hash = '#/day';
  toast(skipped ? 'Готово. Всё можно настроить позже' : 'Персонаж создан ✦');
}

/** Снять всё, что на экране, в черновик — перед любым переходом. */
const sync = () => Object.assign(draft(), collect());

export const actions = {
  chrono: v => update(() => { sync(); draft().chronotype = v.v; }),
  hab: v => update(() => {
    sync();
    const d = draft();
    d.habits = d.habits.includes(v.v) ? d.habits.filter(x => x !== v.v) : [...d.habits, v.v];
  }),
  next: () => update(() => { sync(); draft().step = Math.min(2, draft().step + 1); }),
  back: () => update(() => { sync(); draft().step = Math.max(0, draft().step - 1); }),
  skip: () => { sync(); finish(true); },
  finish: () => { sync(); finish(false); },
};
