// «Настройки»: профиль, данные и честный список того, что приложение умеет.

import { S, update, exportJSON, importJSON, resetAll, level, prevRaw } from '../store.js';
import { todayISO } from '../dates.js';
import { BUILD } from '../version.js';
import { hasKey, maskKey, setKey, setModel, getModel, checkKey, DEFAULT_MODEL } from '../ai.js';
import { h, raw, field, toast, openSheet, confirmSheet } from '../ui.js';
import { tipsOn, tipsReset, tipsDisable } from '../tips.js';
import { APP_ICONS, iconKey, setAppIcon, iconById } from '../appicon.js';
import { THEMES, themeKey, setTheme, themeById } from '../theme.js';

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
      <div class="ink">Всё живёт только на этом устройстве: браузерное хранилище, без сервера и аккаунта.</div>
      <div class="lab">Само по себе приложение ничего наружу не отправляет. Исключение — то, что ты включишь ниже:
        оценка блюда и вопросы Летописцу уходят в OpenAI, потому что сервера у приложения нет.</div>
    </div>

    <div class="card">
      <div class="caps">ИИ · OpenAI</div>
      ${hasKey() ? raw(h`
        <div class="row between"><span class="ink">Ключ</span><span class="lab">${maskKey()}</span></div>
        <div class="row between"><span class="ink">Модель</span><span class="lab">${getModel()}</span></div>
        <button class="add" data-act="aicheck">Проверить ключ</button>
        <button class="add" data-act="aikey">Изменить</button>`)
      : raw(h`
        <div class="ink">Ключ не задан. Без него работают все экраны, кроме оценки фото и свободных вопросов Летописцу.</div>
        <button class="add" data-act="aikey">Добавить ключ OpenAI</button>`)}
      <div class="lab">Ключ хранится только на этом устройстве и намеренно не попадает в резервную копию.
        Запросы идут с телефона прямо в OpenAI и оплачиваются по твоему счёту — на platform.openai.com
        стоит выставить месячный лимит.</div>
      <div class="lab">Что уходит: при оценке блюда — снимок (он нигде не сохраняется) или твоё описание; при вопросе
        Летописцу — короткая выжимка: сегодняшние квесты, энергия, потребности. Дневник и цикл не отправляются.</div>
    </div>

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
      <div class="lab">Приложение обновляется само при запуске. Если номер сборки не меняется после выхода новой версии — обнови вручную.</div>
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
  aikey: () => openSheet({
    title: 'Ключ OpenAI',
    sub: 'создаётся на platform.openai.com → API keys',
    body: [
      field.text('key', 'Ключ', '', 'sk-...'),
      field.text('model', 'Модель', getModel(), DEFAULT_MODEL),
      field.note('Ключ вводится один раз и остаётся на этом устройстве. Если оставить поле пустым и сохранить, ключ будет удалён.'),
    ].join(''),
    primary: 'Сохранить',
    onSave: (v, close) => {
      const key = (v.key || '').trim();
      if (key && !key.startsWith('sk-')) return toast('Ключ OpenAI начинается с sk-');
      setKey(key);
      setModel(v.model);
      close();
      update(() => {});
      toast(key ? 'Ключ сохранён' : 'Ключ удалён');
    },
    danger: hasKey() ? 'Удалить ключ' : null,
    onDanger: (_v, close) => { setKey(''); close(); update(() => {}); toast('Ключ удалён'); },
  }),

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
