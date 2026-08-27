// «Внутри»: Летописец, тесты и дневник.
// Летописец работает без сети — это правила поверх твоих данных, не языковая модель.

import { S, update, uid, XP, addXp, addDiary } from '../store.js';
import { todayISO, addDays, dayShort } from '../dates.js';
import { h, raw, field, toast, openSheet } from '../ui.js';
import { weekStats, needs, roles, questsOn, peakLabel, chatDigest, diaryDigest } from '../selectors.js';
import { questSheet } from './day.js';
import { hasKey, chatChronicler } from '../ai.js';
import { byId, nameOf } from '../traits.js';
import { TESTS, testLength, scoreTest } from '../tests.js';

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
  const busy = !!S.ui.chatBusy;
  const online = hasKey();
  return h`
    ${log.slice(-40).map(m => raw(m.who === 'ai' ? h`<div class="ai">${m.text}</div>` : h`<div class="me">${m.text}</div>`))}
    ${busy ? raw('<div class="ai typing">думаю…</div>') : ''}

    ${S.ui.offerMove ? raw(h`
      <div class="pills" style="margin-top:4px">
        <button class="pill on" data-act="move">Да, перенеси вечер</button>
        <button class="pill" data-act="nomove">Нет, оставь</button>
      </div>`) : raw(h`
      <div class="pills" style="margin-top:4px">
        ${(online ? OPENERS : QUICK).map(q => raw(h`<button class="pill" data-act="${online ? 'starter' : 'say'}" data-v="${q.id}">${q.label}</button>`))}
      </div>`)}

    ${online ? raw(h`
      <div class="card chat-box">
        <div class="fld">
          <textarea rows="2" data-field="ask"
            placeholder="что на душе? можно просто рассказать, как есть"></textarea>
        </div>
        <div class="row between">
          <button class="pill" data-act="clear">очистить беседу</button>
          <button class="btn" data-act="ask" ${busy ? 'disabled' : ''}>${busy ? 'Думаю…' : 'Отправить'}</button>
        </div>
        <label class="row tight" style="font-size:12.5px">
          <input type="checkbox" data-change="withdiary" ${S.ui.chatDiary ? 'checked' : ''}>
          Показывать последние записи дневника
        </label>
        <div class="lab">Уйдёт в OpenAI: твои сообщения, нить беседы и выжимка — квесты, энергия, цели, привычки,
          потребности, просроченная забота${S.ui.chatDiary ? ', последние пять записей дневника' : ''}.
          Цикл, КБЖУ и бюджет не отправляются${S.ui.chatDiary ? '' : ', дневник тоже'}.</div>
      </div>`)
    : raw(h`
      <div class="card mute">
        <div class="lab">Сейчас Летописец работает офлайн: это правила поверх твоих отметок. Чтобы разговаривать
        своими словами — про день, усталость, планы и что угодно, — добавь ключ OpenAI в Настройках.</div>
      </div>`)}`;
}

/** С чего можно начать разговор, когда не знаешь, с чего начать. */
const OPENERS = [
  { id: 'day', label: 'Как мой день?' },
  { id: 'tired', label: 'Я вымоталась' },
  { id: 'stuck', label: 'Застряла' },
  { id: 'think', label: 'Помоги подумать' },
];

const OPENER_TEXT = {
  day: 'Посмотри на мой день и скажи, что видишь.',
  tired: 'Я вымоталась. Не знаю, за что хвататься.',
  stuck: 'Я застряла с одним делом и хожу вокруг него кругами.',
  think: 'Хочу подумать вслух — задавай вопросы.',
};

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
function testsView() {
  const run = S.ui.test;
  if (run) return testRun(run);
  return h`
    ${Object.entries(TESTS).map(([key, t]) => {
      const done = S.tests[key];
      return raw(h`
        <div class="card">
          <div class="row between">
            <div class="grow">
              <div class="ink"><b>${t.name}</b></div>
              <div class="lab">${done ? `пройден · ${done.title || done.trait || ''}` : t.sub}</div>
              ${t.source ? raw(h`<div class="lab">${t.source}</div>`) : ''}
            </div>
            <button class="pill" data-act="start" data-v="${key}">${done ? 'пройти снова' : 'начать'}</button>
          </div>
        </div>`);
    })}
    <div class="card dash"><div class="lab">Тесты меняют не тебя, а приложение: после них перестраиваются подсказки и награды.
      Часть опросников взята из опубликованных методик — это самоотчёт, а не диагностика.</div></div>`;
}

function testRun(run) {
  const t = TESTS[run.key];
  const total = testLength(t);
  if (run.finished) return testResult(run, t);

  const step = run.step;
  const head = h`
    <div class="row between"><div class="caps">${t.name}</div><span class="lab">${step + 1} из ${total}</span></div>
    <div class="bar"><i style="width:${Math.round(step / total * 100)}%"></i></div>`;

  // Опросник с вариантами: и свои тесты, и rMEQ, где у каждого пункта свои баллы.
  if (t.kind === 'pick' || t.picks) {
    const q = t.questions[step];
    return h`
      ${raw(head)}
      <div class="title" style="font-size:19px">${q.q}</div>
      ${q.a.map(([label, key]) => raw(h`<button class="card" style="text-align:left" data-act="answer" data-v="${key}"><div class="ink">${label}</div></button>`))}
      <div class="lab" style="text-align:center">без правильных ответов</div>
      <button class="btn-ghost" data-act="cancel">выйти</button>`;
  }

  // Шкала: один пункт — ряд ответов от «совсем нет» до «точно да».
  const item = t.items[step];
  return h`
    ${raw(head)}
    ${t.intro ? raw(h`<div class="lab">${t.intro}</div>`) : ''}
    <div class="title" style="font-size:19px">${item.t}</div>
    <div class="scale">
      ${t.scale.map((label, i) => raw(h`
        <button class="card scale-btn" data-act="answer" data-v="${i + 1}">
          <span class="ink"><b>${i + 1}</b></span><span class="lab">${label}</span>
        </button>`))}
    </div>
    <button class="btn-ghost" data-act="cancel">выйти</button>`;
}

/** Результат: у методик — разбор по шкалам, у своих тестов — черта. */
function testResult(run, t) {
  const res = run.res || {};
  const trait = res.traitId ? byId(res.traitId) : null;
  return h`
    <div class="card">
      <div class="caps">${t.name} · результат</div>
      <div class="title" style="font-size:20px">${trait ? `${trait.icon} ${nameOf(trait)}` : res.title}</div>
      ${trait && res.title !== nameOf(trait) ? raw(h`<div class="ink">${res.title}</div>`) : ''}
      ${(res.lines || []).map(l => raw(h`<div class="lab">${l}</div>`))}
      ${t.source ? raw(h`<div class="lab">Методика: ${t.source}.</div>`) : ''}
    </div>
    ${trait ? raw(h`
      <div class="card">
        <div class="caps">Что перестроится</div>
        <div class="ink">${trait.does || trait.desc}</div>
        <div class="lab">Это не подпись на профиле: черта правда меняет то, что показано и как говорит Летописец.</div>
      </div>`) : ''}
    ${res.chronotype ? raw(h`<div class="card mute"><div class="lab">Хронотип в профиле станет «${res.chronotype}» — от него зависит кривая дня.</div></div>`) : ''}
    ${res.introversion != null ? raw(h`<div class="card mute"><div class="lab">Ползунок интроверсии встанет на ${res.introversion} — это та же шкала, что и в профиле.</div></div>`) : ''}
    <button class="btn" data-act="accept">Сохранить</button>
    <button class="btn-ghost" data-act="cancel">оставить как было</button>`;
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
/** Чат открывается снизу — как любая переписка. */
export const stickBottom = params => tab(params) === 'chat';

export const actions = {
  tab: v => { update(s => { s.ui.insideTab = v.v; }); location.hash = '#/inside/' + v.v; },

  /** Беседа: отправляем нить целиком, поэтому разговор помнит себя. */
  ask: async (v, el) => {
    if (S.ui.chatBusy) return;
    const box = document.querySelector('#scr [data-field="ask"]');
    const q = (v.value || el?.value || box?.value || '').trim();
    if (!q) return toast('Напиши, о чём поговорим');
    if (box) box.value = '';
    await talk(q);
  },

  /** Начало разговора одной кнопкой — дальше обычная беседа. */
  starter: v => talk(OPENER_TEXT[v.v] || v.v),

  withdiary: v => update(s => { s.ui.chatDiary = !!v.checked; }),

  clear: () => update(s => { s.chat = []; s.ui.chatBusy = false; }),

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
    if (run.step >= testLength(TESTS[run.key])) {
      run.res = scoreTest(run.key, run.picks);
      run.finished = true;
    }
  }),

  /** Сохранение результата: черта, если она есть, и настройки, на которые
   *  методика прямо отвечает — хронотип и интроверсия. */
  accept: () => {
    const run = S.ui.test;
    const t = TESTS[run.key], res = run.res || {};
    const trait = res.traitId ? byId(res.traitId) : null;
    update(s => {
      s.tests[run.key] = {
        title: res.title, trait: trait ? nameOf(trait) : '', id: res.traitId || '',
        result: res.pickResult || res.title, lines: res.lines || [], date: todayISO(),
      };
      if (res.traitId && !s.user.traits.includes(res.traitId)) s.user.traits.push(res.traitId);
      if (res.chronotype) s.user.chronotype = res.chronotype;
      if (res.introversion != null) s.user.introversion = res.introversion;
      addDiary(s, `тест «${t.name}»: ${res.title}`, 'тесты', 'test');
      addXp(XP.test);
      s.ui.test = null;
    });
    toast(trait ? `Черта добавлена: ${nameOf(trait)}` : 'Результат сохранён');
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

/** Один ход беседы: показать вопрос, сходить к модели, показать ответ. */
async function talk(text) {
  push('me', text);
  update(s => { s.ui.chatBusy = true; });
  try {
    const extra = S.ui.chatDiary ? diaryDigest(5) : '';
    const answer = await chatChronicler(S.chat, chatDigest(), extra);
    update(s => {
      s.ui.chatBusy = false;
      s.chat.push({ id: uid(), who: 'ai', text: answer || 'Не нашлось, что ответить.', ts: Date.now() });
      s.chat = s.chat.slice(-60);
    });
  } catch (e) {
    update(s => {
      s.ui.chatBusy = false;
      s.chat.push({ id: uid(), who: 'ai', text: 'Не получилось ответить: ' + String(e.message || e).slice(0, 120), ts: Date.now() });
    });
  }
}
