// «Настройки»: профиль, данные и честный список того, что приложение умеет.

import { S, update, exportJSON, importJSON, resetAll, level, prevRaw } from '../store.js';
import { todayISO, stampLabel } from '../dates.js';
import { BUILD } from '../version.js';
import { newBuild } from '../update.js';
import { hasKey, maskKey, setKey, setModel, getModel, checkKey, fetchModels, knownModels, viaCloud, DEFAULT_MODEL } from '../ai.js';
import { h, raw, field, toast, openSheet, confirmSheet } from '../ui.js';
import { tipsOn, tipsReset, tipsDisable } from '../tips.js';
import { APP_ICONS, iconKey, setAppIcon, iconById } from '../appicon.js';
import { THEMES, themeKey, setTheme, themeById } from '../theme.js';
import { configured, signedIn, account, lastSync, busy, signIn, signOut, syncNow, widgetToken } from '../cloud.js';


/**
 * Синхронизация. Пока облако не настроено — говорим об этом прямо, а не
 * рисуем кнопку, которая ничего не делает. Войти можно в любой момент: до
 * входа планер работает как работал, а при входе то, что уже записано на
 * устройстве, не заменяется облачным, а сливается с ним.
 */
/**
 * Выбор модели списком, а не полем ввода: опечатка в названии выясняется
 * только в момент запроса, и выглядит это как «ИИ сломался». Список берём у
 * самого OpenAI — свой устаревал бы молча. Нынешнюю модель добавляем всегда,
 * даже если её в списке нет: иначе выбор молча подменил бы её на чужую.
 */
function modelField() {
  const have = knownModels();
  const cur = getModel();
  const ids = have.includes(cur) ? have : [cur, ...have];
  if (!have.length) {
    return field.select('model', 'Модель', [{ value: cur, label: cur }], cur)
      + field.note('Список моделей появится после проверки ключа — его отдаёт сам OpenAI.');
  }
  return field.select('model', 'Модель', ids.map(id => ({ value: id, label: id })), cur);
}

function syncCard() {
  if (!configured()) {
    return h`<div class="card">
      <div class="caps">Синхронизация</div>
      <div class="lab">Не настроена: данные живут только в этом браузере.
        Как включить — в docs/облако.md рядом с приложением.</div>
    </div>`;
  }
  if (!signedIn()) {
    return h`<div class="card">
      <div class="caps">Синхронизация</div>
      <div class="ink">Телефон и ноутбук на одних данных.</div>
      <div class="lab" style="margin-top:6px">Всё, что уже записано здесь, при входе никуда не денется:
        оно сольётся с тем, что в облаке, а не заменится им.</div>
      <div class="lab">От входа зависит и ИИ: ключ OpenAI может лежать в облаке, и тогда он один на все устройства.</div>
      <button class="add" data-act="signin">Войти через Яндекс</button>
    </div>`;
  }
  const who = account();
  const when = lastSync();
  return h`<div class="card">
    <div class="caps">Синхронизация</div>
    <div class="ink">${who?.email || who?.login || 'вход выполнен'}</div>
    <div class="lab">${busy() ? 'синхронизирую…' : when ? `последний раз ${stampLabel(when)}` : 'ещё не синхронизировано'}</div>
    <button class="add" data-act="syncnow">Синхронизировать сейчас</button>
    <button class="btn-ghost" data-act="signout">Выйти</button>
    <div class="lab">Выход не трогает записи на устройстве — они остаются здесь.</div>
  </div>

  <div class="card mute">
    <div class="caps">Виджет на экран</div>
    <div class="lab">Календарь месяца и сегодняшний список прямо на домашнем экране айфона.
      Нужен Scriptable из App Store: положи туда файл widget/lifeos-widget.js из этого проекта,
      добавь средний виджет и вставь код доступа в поле Parameter. Как — в docs/виджет.md.</div>
    <button class="btn-ghost" data-act="widgetkey">Показать код доступа</button>
    <div class="lab">Код — это ключ от твоих данных. Никому не показывай и не выкладывай в скриншотах.</div>
  </div>`;
}

export function render() {
  const size = (() => {
    try { return Math.round((localStorage.getItem('lifeos.state') || '').length / 1024); } catch { return 0; }
  })();
  const counts = {
    quests: Object.values(S.quests).reduce((a, x) => a + x.length, 0),
    goals: S.goals.length,
    habits: S.habits.length,
    diary: S.diary.length,
    measures: S.health.measures.length,
  };

  return h`
    <div class="title">Настройки</div>

    <div class="card">
      <div class="caps">Мои параметры</div>
      <div class="row between"><span class="ink">Имя</span><span class="lab">${S.user.name || '—'}</span></div>
      <div class="row between"><span class="ink">Хронотип</span><span class="lab">${S.user.chronotype}</span></div>
      <div class="row between"><span class="ink">Сон</span><span class="lab">${S.user.sleep} ч</span></div>
      <div class="row between"><span class="ink">Уровень</span><span class="lab">${level(S.user.xp)} · ${S.user.xp} XP</span></div>
      <button class="add" data-act="profile">Изменить</button>
    </div>

    <div class="card">
      <div class="caps">Данные и приватность</div>
      <div class="ink">Записи живут на этом устройстве. Наружу уходит только то, что ты включила сама.</div>
      <div class="lab" style="margin-top:6px">${signedIn()
        ? 'Синхронизация включена: копия данных лежит в твоём облаке, в твоём же аккаунте. Кто их читает, решает не приложение, а проверка на той стороне: она спрашивает у Яндекса, чей вход, и чужому файл не отдаст.'
        : 'Синхронизация выключена: копии нигде нет, и данные не переживут очистку браузера. Копию в файл стоит делать хоть иногда.'}</div>
      <div class="lab">В OpenAI уходит только то, что ты просишь сама: снимок блюда или его описание, а для
        вопроса Летописцу — выжимка по сферам: день, цели, привычки, работа, учёба, спорт, еда, сон, деньги,
        блог, фриланс, своё дело, книги, страны. Иначе он не смог бы ответить про половину твоей жизни.</div>
      <div class="lab">Цикл и записи «Внутри» не отправляются никогда. Дневник — только если включить тумблер
        в самом чате; по умолчанию он выключен.</div>
      <div class="lab">Ключ OpenAI хранится отдельно от остальных данных и намеренно не попадает ни в копию, ни в облако:
        он бы уехал в файл, который ты кому-нибудь перешлёшь.</div>
    </div>

    <div class="card">
      <div class="caps">ИИ · OpenAI</div>
      ${viaCloud() ? raw(h`
        <div class="ink">Своего ключа здесь нет — попробую через твоё облако.</div>
        <div class="lab" style="margin-top:6px">Там ключ лежит в настройках функции и в браузер не попадает.
          Но запрос уходит из дата-центра, а OpenAI принимает запросы не отовсюду: если откажет по региону —
          добавь ключ сюда, тогда запросы пойдут прямо с этого устройства.</div>
        <div class="row between" style="margin-top:8px"><span class="ink">Модель</span><span class="lab">${getModel()}</span></div>
        <button class="add" data-act="aikey">Выбрать модель</button>
        <button class="btn-ghost" data-act="aikey" data-local="1">Добавить ключ на это устройство</button>`)
      : hasKey() ? raw(h`
        <div class="row between"><span class="ink">Ключ</span><span class="lab">${maskKey()}</span></div>
        <div class="row between"><span class="ink">Модель</span><span class="lab">${getModel()}</span></div>
        <button class="add" data-act="aicheck">Проверить ключ</button>
        <button class="add" data-act="aikey">Изменить</button>`)
      : raw(h`
        <div class="ink">Ключ не задан. Без него работают все экраны, кроме оценки фото и свободных вопросов Летописцу.</div>
        ${configured() && !signedIn() ? raw(h`<div class="lab" style="margin-top:6px">Если ключ лежит в облаке,
          он включится сам после входа — тогда вводить его здесь не нужно.</div>`) : ''}
        <button class="add" data-act="aikey">Добавить ключ OpenAI</button>`)}
      <div class="lab">Запросы идут с этого устройства прямо в OpenAI и оплачиваются по твоему счёту —
        на platform.openai.com стоит выставить месячный лимит.</div>
    </div>

    ${raw(syncCard())}

    <div class="card">
      <div class="caps">Данные</div>
      <div class="lab">${counts.quests} квестов · ${counts.goals} целей · ${counts.habits} привычек · ${counts.diary} записей · ${counts.measures} замеров · ${size} КБ</div>
      <button class="add" data-act="export">Скачать копию (JSON)</button>
      ${prevRaw() ? raw(h`<button class="btn-ghost" data-act="prev">Скачать состояние до обновления формата</button>
        <div class="lab">Приложение откладывает копию перед каждой сменой формата данных.
          Если после обновления чего-то не хватает — она здесь.</div>`) : ''}
      <button class="add" data-act="import">Загрузить из копии</button>
      <div class="lab">Копию стоит делать хоть иногда: если очистить данные браузера, всё пропадёт.</div>
    </div>

    <div class="card">
      <div class="caps">Подсказки</div>
      <div class="lab">${tipsOn()
        ? 'Показываю по одной карточке на экран — каждую только раз.'
        : 'Сейчас выключены.'}</div>
      <button class="add" data-act="tips">${tipsOn() ? 'Выключить подсказки' : 'Показать подсказки заново'}</button>
    </div>

    <div class="card">
      <div class="caps">Версия</div>
      <div class="row between"><span class="ink">Сборка</span><span class="lab">${BUILD}</span></div>
      ${newBuild() ? raw(h`<div class="ink" style="margin-top:6px">Вышла новая: ${newBuild()}</div>
        <div class="lab">Вкладка, открытая давно, продолжает работать на старом коде — обновление её не догоняет.</div>`)
      : raw(h`<div class="lab">Это самая свежая. Приложение обновляется само при запуске.</div>`)}
      <button class="add" data-act="refresh">Обновить приложение</button>
    </div>

    <div class="card">
      <div class="caps">Тема</div>
      <div class="icon-grid themes">
        ${THEMES.map(t => raw(h`<button class="icon-pick ${t.key === themeKey() ? 'on' : ''}" data-act="theme" data-id="${t.key}">
          <span class="theme-dot" style="background:linear-gradient(135deg, ${t.dot[0]} 50%, ${t.dot[1]} 50%)"></span>
          <span class="ink">${t.name}</span>
          <span class="lab">${t.note}</span></button>`))}
      </div>
      <div class="lab">Меняется сразу и запоминается на этом устройстве.</div>
    </div>

    <div class="card">
      <div class="caps">Иконка приложения</div>
      <div class="icon-grid apps">
        ${APP_ICONS.map(i => raw(h`<button class="icon-pick ${i.key === iconKey() ? 'on' : ''}" data-act="icon" data-id="${i.key}">
          <img src="icons/${i.key}-192.png" alt="${i.name}" width="64" height="64" loading="lazy">
          <span class="ink">${i.name}</span>
          <span class="lab">${i.note}</span></button>`))}
      </div>
      <div class="lab">Во вкладке браузера иконка меняется сразу. Ярлык, который уже стоит на экране «Домой», система нарисовала при установке и сама не обновит — чтобы увидеть новую, поставь ярлык заново.</div>
    </div>

    <div class="card">
      <div class="caps">Установить на телефон</div>
      <div class="ink">iPhone: «Поделиться» → «На экран „Домой“». Android: меню браузера → «Установить приложение».</div>
      <div class="lab">После установки открывается без браузера и работает офлайн.</div>
    </div>

    <div class="card dash">
      <div class="caps">Опасная зона</div>
      <button class="btn-ghost danger" data-act="reset">Стереть все данные</button>
    </div>

    <div class="card mute">
      <div class="lab">Дизайн-пакет, из которого выросло приложение: <a href="design/">прототип, вайрфреймы и хендофф</a>.</div>
    </div>
    <div style="height:4px"></div>`;
}

export const actions = {
  theme: v => {
    if (!v.id || v.id === themeKey()) return;
    setTheme(v.id);
    toast(`Тема · ${themeById(v.id).name}`);
  },
  icon: v => {
    const key = v.id;
    if (!key || key === iconKey()) return;
    setAppIcon(key);
    toast(`Иконка · ${iconById(key).name}`);
  },
  tips: () => { if (tipsOn()) { tipsDisable(); toast('Выключила'); } else { tipsReset(); toast('Подсказки вернулись'); } },
  aikey: (v = {}) => {
    // «Своим ключом» — когда просят явно: облако есть, но человек хочет здесь.
    const local = !!v.local || !viaCloud();
    const wrap = openSheet({
    title: 'Ключ OpenAI',
    sub: 'создаётся на platform.openai.com → API keys',
    body: [
      local ? field.text('key', 'Ключ', '', 'sk-...') : '',
      modelField(),
      !local ? field.note('Ключ живёт в твоей функции — здесь только выбор модели.') : field.note(hasKey()
        ? 'Ключ уже задан и показан выше звёздочками. Оставь поле пустым — он останется прежним, можно менять только модель. Удаляется отдельной кнопкой внизу.'
        : 'Ключ вводится один раз и остаётся на этом устройстве.'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      const key = (v.key || '').trim();
      if (key && !key.startsWith('sk-')) return toast('Ключ OpenAI начинается с sk-');
      // Пустое поле значит «не трогай ключ», а не «удали». Удаление — это
      // отдельная кнопка: со списком моделей менять одну только модель стало
      // обычным делом, и сохранение молча уносило бы ключ с собой.
      if (key) setKey(key);
      setModel(v.model);
      close();
      update(() => {});
      toast(key ? 'Ключ сохранён' : 'Ключ удалён');
    },
    danger: hasKey() && !viaCloud() ? 'Удалить ключ' : null,
    onDanger: (_v, close) => { setKey(''); close(); update(() => {}); toast('Ключ удалён'); },
    });
    // Списка ещё нет — спросим у OpenAI и перерисуем одно поле, не трогая
    // остальные: человек в этот момент может печатать ключ.
    if (hasKey() && !knownModels().length) {
      fetchModels().then(() => {
        const box = wrap?.querySelector('select[name="model"]')?.closest('.fld');
        if (box) box.outerHTML = modelField();
      }).catch(() => { /* не вышло — останется поле с тем, что есть */ });
    }
  },

  aicheck: async () => {
    toast('Проверяю…');
    try {
      const r = await checkKey();
      toast(r.hasModel ? `Ключ работает, модель на месте` : `Ключ работает, но модели «${getModel()}» в списке нет`);
    } catch (e) {
      toast(String(e.message || e).slice(0, 90));
    }
  },

  /** Сбросить кеш оболочки и перезапуститься — данные не трогаем, они в localStorage. */
  refresh: async () => {
    toast('Обновляю…');
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (e) {
      console.warn('[lifeos] очистка кеша не удалась', e);
    }
    location.replace(location.pathname + '?v=' + Date.now() + location.hash);
  },

  profile: () => openSheet({
    title: 'Мои параметры',
    body: [
      field.text('name', 'Имя', S.user.name),
      field.opts('chronotype', 'Хронотип', ['жаворонок', 'сова', 'плавает'], S.user.chronotype),
      field.range('sleep', 'Нужно спать', S.user.sleep, { min: 6, max: 11, step: 0.5, suffix: ' ч' }),
      field.range('introversion', 'Интроверсия', S.user.introversion, { left: 'люди', right: 'тишина' }),
      field.range('activity', 'Активность', S.user.activity, { left: 'покой', right: 'движение' }),
    ].join(''),
    onSave: (v, close) => {
      update(s => {
        s.user.name = (v.name || '').trim() || s.user.name;
        s.user.chronotype = v.chronotype;
        s.user.sleep = Number(v.sleep);
        s.user.introversion = Number(v.introversion);
        s.user.activity = Number(v.activity);
      });
      close();
      toast('Сохранено');
    },
  }),

  /** Копия до последней смены формата: страховка, если новая версия что-то потеряла. */
  prev: () => {
    const raw2 = prevRaw();
    if (!raw2) return toast('Копии нет');
    const a2 = document.createElement('a');
    a2.href = URL.createObjectURL(new Blob([raw2], { type: 'application/json' }));
    a2.download = `life-os-before-update-${todayISO()}.json`;
    document.body.appendChild(a2);
    a2.click();
    setTimeout(() => { URL.revokeObjectURL(a2.href); a2.remove(); }, 1000);
    toast('Копия скачана');
  },

  export: () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `life-os-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Копия скачана');
  },

  signin: () => signIn(),
  signout: () => confirmSheet('Выйти?', 'Записи на этом устройстве останутся на месте — уйдёт только связь с облаком.', 'Выйти',
    () => { signOut(); toast('Вышла'); }),
  syncnow: async () => {
    toast('Синхронизирую…');
    const r = await syncNow();
    toast(r.ok ? (r.first ? 'Данные отправлены в облако' : 'Синхронизировано') : `Не вышло: ${r.reason}`);
  },

  /**
   * Код для виджета — это токен входа. Держим его закрытым до тапа и говорим,
   * чем он является: строка, открывающая данные, не должна выглядеть безобидным
   * набором букв.
   */
  widgetkey: () => {
    const tk = widgetToken();
    if (!tk) return toast('Сначала войди в облако');
    openSheet({
      title: 'Код доступа для виджета',
      sub: 'вставь его в поле Parameter у виджета',
      body: [
        field.area('key', 'Код', tk),
        field.note('Это ключ от твоих данных: кто его получит, увидит всё, что синхронизируется. '
          + 'Не выкладывай его в переписках и скриншотах. Если он всё же ушёл — выйди из облака и войди заново, '
          + 'старый код перестанет работать.'),
        field.note('Виджет только читает: он ничего не записывает и не меняет.'),
      ].join(''),
      primary: 'Скопировать',
      onSave: (_v, close) => {
        navigator.clipboard?.writeText(tk).then(() => toast('Скопировала'), () => toast('Скопируй вручную из поля'));
        close();
      },
    });
  },

  import: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          importJSON(String(reader.result));
          toast('Данные загружены');
        } catch (e) {
          toast('Не получилось: ' + e.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },

  reset: () => confirmSheet(
    'Стереть все данные?',
    'Квесты, цели, привычки, дневник и замеры исчезнут навсегда. Сначала лучше скачать копию.',
    'Да, стереть',
    () => { resetAll(); location.hash = '#/day'; toast('Всё стёрто'); },
  ),
};
