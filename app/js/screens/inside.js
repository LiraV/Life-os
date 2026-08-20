// «Внутри»: Летописец, тесты и дневник.
// Летописец работает без сети — это правила поверх твоих данных, не языковая модель.

import { S, update, uid, XP, addXp, addDiary } from '../store.js';
import { todayISO, addDays, dayShort } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { weekStats, needs, roles, questsOn, peakLabel } from '../selectors.js';
import { questSheet } from './day.js';

const TABS = [['chat', 'Чат'], ['tests', 'Тесты'], ['diary', 'Дневник']];
const tab = params => params[0] || S.ui.insideTab || 'chat';

export function render(params) {
  const t = tab(params);
  return h`
    <div class="title">Внутри</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${t === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ chat: chatView, tests: testsView, diary: diaryView }[t]())}
    <div style="height:4px"></div>`;
}

// ── чат ─────────────────────────────────────────────────────────
const QUICK = [
  { id: 'day', label: 'Что у меня сегодня?' },
  { id: 'week', label: 'Как идёт неделя?' },
  { id: 'hard', label: 'Тяжёлый день' },
  { id: 'need', label: 'Чего мне не хватает?' },
  { id: 'add', label: 'Добавь дело' },
];

function chatView() {
  const log = S.chat.length ? S.chat : [{ who: 'ai', text: greeting() }];
  return h`
    ${log.slice(-14).map(m => raw(m.who === 'ai' ? h`<div class="ai">${m.text}</div>` : h`<div class="me">${m.text}</div>`))}
    ${S.ui.offerMove ? raw(h`
      <div class="pills" style="margin-top:4px">
        <button class="pill on" data-act="move">Да, перенеси вечер</button>
        <button class="pill" data-act="nomove">Нет, оставь</button>
      </div>`) : raw(h`
      <div class="pills" style="margin-top:4px">
        ${QUICK.map(q => raw(h`<button class="pill" data-act="say" data-v="${q.id}">${q.label}</button>`))}
      </div>`)}
    <div class="card mute">
      <div class="lab">Летописец работает офлайн: это правила поверх твоих отметок, а не языковая модель.
      Он ничего не отправляет наружу и никогда не меняет цели сам.</div>
    </div>`;
}

function greeting() {
  const name = S.user.name || 'привет';
  return `${name}, я рядом. Смотрю на твои отметки и подсказываю — но решаешь ты.`;
}

/** Ответы Летописца: каждый собран из реальных данных. */
function reply(id) {
  const t = todayISO();
  const qs = questsOn(t);
  switch (id) {
    case 'day': {
      const left = qs.filter(q => !q.done);
      if (!qs.length) return 'На сегодня пусто. Добавим одно дело — и хватит.';
      return `Сегодня ${qs.length} ${plural(qs.length, 'дело', 'дела', 'дел')}, осталось ${left.length}. Пик энергии в ${peakLabel()} — тяжёлое туда.`;
    }
    case 'week': {
      const w = weekStats(t);
      if (!w.total) return 'На этой неделе задач ещё нет. Соберём в воскресенье?';
      return `За неделю закрыто ${w.done} из ${w.total}. Это не оценка — просто факт.`;
    }
    case 'hard': {
      const evening = qs.filter(q => !q.done && q.time >= '18:00');
      if (!evening.length) return 'Тогда ничего не двигаем — на вечер и так ничего тяжёлого. Отдыхай.';
      return `Вижу ${evening.length} ${plural(evening.length, 'дело', 'дела', 'дел')} на вечер. Перенести на завтра? Ничего не потеряется.`;
    }
    case 'need': {
      const low = needs().filter(n => n.value != null && n.value < 50);
      const role = roles().find(r => r.low);
      if (low.length) return `Просело: ${low.map(n => n.name.toLowerCase()).join(', ')}. Начни с малого — одно действие на этой неделе.`;
      if (role) return `${role.name} две недели без дела. Вернём что-нибудь маленькое?`;
      return 'Всё в порядке: потребности закрыты, роли при деле. Так тоже бывает.';
    }
    default: return 'Открываю редактор — добавь, что нужно.';
  }
}

const plural = (n, a, b, c) => {
  const m = n % 100, d = n % 10;
  return m > 4 && m < 20 ? c : d === 1 ? a : d > 1 && d < 5 ? b : c;
};

function push(who, text) {
  update(s => { s.chat.push({ id: uid(), who, text, ts: Date.now() }); s.chat = s.chat.slice(-60); });
}

// ── тесты ───────────────────────────────────────────────────────
const TESTS = {
  motivation: {
    name: 'Мотивация',
    sub: 'без правильных ответов',
    questions: [
      { q: 'Что радует сильнее?', a: [['Красиво оформленный результат', 'aesthete'], ['Новое, чего не пробовала', 'explorer'], ['Обойти вчерашнюю себя', 'racer'], ['Что это кому-то нужно', 'keeper']] },
      { q: 'Когда бросаешь начатое?', a: [['Когда получается некрасиво', 'aesthete'], ['Когда стало предсказуемо', 'explorer'], ['Когда не видно прогресса', 'racer'], ['Когда теряется смысл', 'keeper']] },
      { q: 'Идеальная награда?', a: [['Что-то ощутимое и красивое', 'aesthete'], ['Дверь в новую тему', 'explorer'], ['Цифра, которая выросла', 'racer'], ['Спасибо от близкого', 'keeper']] },
    ],
    results: {
      aesthete: { trait: 'Эстет достижений ✦', text: 'Тебя двигает форма, а не счётчик. Значит, награды — визуальные, а не цифры.' },
      explorer: { trait: 'Исследовательница', text: 'Тебя двигает новизна. Значит, в каждый месяц полезно класть одну незнакомую вещь.' },
      racer: { trait: 'Соревновательница', text: 'Тебя двигает видимый рост. Значит, прогресс-бары и «было/стало» — твоё.' },
      keeper: { trait: 'Хранительница смысла', text: 'Тебя двигает «зачем». Значит, цепочка задача → цель → тема года должна быть всегда на виду.' },
    },
  },
  chrono: {
    name: 'Хронотип точнее',
    sub: 'уточним кривую энергии',
    questions: [
      { q: 'Если не будильник — во сколько проснёшься?', a: [['До 7', 'жаворонок'], ['7–9', 'жаворонок'], ['9–11', 'сова'], ['После 11', 'сова']] },
      { q: 'Когда голова работает лучше всего?', a: [['Сразу после подъёма', 'жаворонок'], ['До обеда', 'жаворонок'], ['Ближе к вечеру', 'сова'], ['Ночью', 'сова']] },
      { q: 'Вечером в 23:00 ты...', a: [['Уже сплю', 'жаворонок'], ['Досыпаю день', 'плавает'], ['Только разошлась', 'сова'], ['Самое рабочее время', 'сова']] },
    ],
    results: {
      'сова': { trait: 'Сова', text: 'Пик вечером. Тяжёлое ставлю на 19–22, утро оставляю мягким.' },
      'жаворонок': { trait: 'Жаворонок', text: 'Пик утром. Тяжёлое ставлю на 10–13, вечер — на восстановление.' },
      'плавает': { trait: 'Плавающий ритм', text: 'Ритм плавает. Буду ориентироваться на твою отметку энергии каждый день.' },
    },
  },
};

function testsView() {
  const run = S.ui.test;
  if (run) return testRun(run);
  return h`
    ${Object.entries(TESTS).map(([key, t]) => {
      const done = S.tests[key];
      return raw(h`
        <div class="card">
          <div class="row between">
            <div><div class="ink"><b>${t.name}</b></div><div class="lab">${done ? `пройден · ${done.trait}` : t.sub}</div></div>
            <button class="pill" data-act="start" data-v="${key}">${done ? 'пройти снова' : 'начать'}</button>
          </div>
        </div>`);
    })}
    <div class="card dash"><div class="lab">Тесты меняют не тебя, а приложение: после них перестраиваются подсказки и награды.</div></div>`;
}

function testRun(run) {
  const t = TESTS[run.key];
  if (run.finished) {
    const res = t.results[run.result];
    return h`
      <div class="card">
        <div class="caps">${t.name} · результат</div>
        <div class="title" style="font-size:20px">${res.trait}</div>
        <div class="ink">${res.text}</div>
      </div>
      <div class="card">
        <div class="caps">Что перестроится</div>
        <div class="ink">${run.key === 'chrono' ? 'Кривая энергии и время фокус-блоков.' : 'Тон подсказок и вид наград на экране «Я».'}</div>
      </div>
      <button class="btn" data-act="accept">Принять</button>
      <button class="btn-ghost" data-act="cancel">оставить как было</button>`;
  }
  const q = t.questions[run.step];
  return h`
    <div class="row between"><div class="caps">${t.name}</div><span class="lab">${run.step + 1} из ${t.questions.length}</span></div>
    <div class="bar"><i style="width:${Math.round(run.step / t.questions.length * 100)}%"></i></div>
    <div class="title" style="font-size:19px">${q.q}</div>
    ${q.a.map(([label, key], i) => raw(h`<button class="card" style="text-align:left" data-act="answer" data-v="${key}"><div class="ink">${label}</div></button>`))}
    <div class="lab" style="text-align:center">без правильных ответов</div>
    <button class="btn-ghost" data-act="cancel">выйти</button>`;
}

// ── дневник ─────────────────────────────────────────────────────
function diaryView() {
  if (!S.diary.length) return h`
    <div class="card dash"><div class="empty">Дневник пополняется сам — из рефлексий, тестов и сфер.<br>Или напиши первую запись.</div></div>
    <button class="add" data-act="entry">+ Запись</button>`;
  return h`
    ${S.diary.slice(0, 40).map((e, i) => raw(h`
      <div class="card" ${raw(i === 0 ? 'style="border:1.5px solid #dcb3a6"' : '')}>
        <div class="row between"><span class="lab">${dayShort(e.date)}${e.when ? ` · ${e.when}` : ''}</span>
          <button class="q-edit" data-act="del" data-id="${e.id}">×</button></div>
        <div class="ink">${e.text}</div>
      </div>`))}
    <button class="add" data-act="entry">+ Запись</button>`;
}

// ── действия ────────────────────────────────────────────────────
export const actions = {
  tab: v => { update(s => { s.ui.insideTab = v.v; }); location.hash = '#/inside/' + v.v; },

  say: v => {
    const q = QUICK.find(x => x.id === v.v);
    push('me', q.label);
    if (v.v === 'add') { setTimeout(() => questSheet(null, todayISO()), 200); }
    setTimeout(() => {
      push('ai', reply(v.v));
      if (v.v === 'hard') {
        const evening = questsOn(todayISO()).filter(x => !x.done && x.time >= '18:00');
        if (evening.length) update(s => { s.ui.offerMove = true; });
      }
    }, 450);
  },

  move: () => {
    const t = todayISO(), tomorrow = addDays(t, 1);
    let n = 0;
    update(s => {
      const stay = [];
      (s.quests[t] || []).forEach(q => {
        if (!q.done && q.time >= '18:00') { (s.quests[tomorrow] ||= []).push(q); n++; }
        else stay.push(q);
      });
      s.quests[t] = stay;
      s.ui.offerMove = false;
      s.chat.push({ id: uid(), who: 'ai', text: `Перенесла ${n} на завтра. Ничего не потеряно.` });
    });
    toast(`Перенесено: ${n}`);
  },
  nomove: () => update(s => { s.ui.offerMove = false; }),

  start: v => update(s => { s.ui.test = { key: v.v, step: 0, picks: [], finished: false }; }),
  answer: v => update(s => {
    const run = s.ui.test;
    run.picks.push(v.v);
    run.step++;
    if (run.step >= TESTS[run.key].questions.length) {
      const counts = {};
      run.picks.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
      run.result = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
      run.finished = true;
    }
  }),
  accept: () => {
    const run = S.ui.test;
    const t = TESTS[run.key], res = t.results[run.result];
    update(s => {
      s.tests[run.key] = { trait: res.trait, result: run.result, date: todayISO() };
      if (!s.user.traits.includes(res.trait)) s.user.traits.push(res.trait);
      if (run.key === 'chrono') s.user.chronotype = run.result;
      addDiary(s, `тест «${t.name}»: ${res.trait}`, 'тесты', 'test');
      addXp(XP.test);
      s.ui.test = null;
    });
    toast(`Черта добавлена: ${res.trait}`);
  },
  cancel: () => update(s => { s.ui.test = null; }),

  entry: () => openSheet({
    title: 'Запись в дневник',
    body: [field.area('text', 'Что было', '', 'как есть, без редактуры'), field.text('when', 'Метка — необязательно', '')].join(''),
    onSave: (v, close) => {
      const text = (v.text || '').trim();
      if (!text) return toast('Пустую не сохраню');
      update(s => addDiary(s, text, (v.when || '').trim(), 'me'));
      close();
      toast('Записала');
    },
  }),
  del: v => update(s => { s.diary = s.diary.filter(x => x.id !== v.id); }),
};
