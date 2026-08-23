// «Настройки»: профиль, данные и честный список того, что приложение умеет.

import { S, update, exportJSON, importJSON, resetAll, level } from '../store.js';
import { todayISO } from '../dates.js';
import { BUILD } from '../version.js';
import { h, field, toast, openSheet, confirmSheet } from '../ui.js';

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
      <div class="caps">Летописец и данные</div>
      <div class="ink">Всё живёт только на этом устройстве: браузерное хранилище, без сервера и аккаунта.
        Ничего не уходит наружу — ни отметки, ни дневник.</div>
      <div class="lab">Летописец — правила поверх твоих данных, а не языковая модель. Цели он не меняет никогда:
        только предлагает, а решаешь ты.</div>
    </div>

    <div class="card">
      <div class="caps">Данные</div>
      <div class="lab">${counts.quests} квестов · ${counts.goals} целей · ${counts.habits} привычек · ${counts.diary} записей · ${counts.measures} замеров · ${size} КБ</div>
      <button class="add" data-act="export">Скачать копию (JSON)</button>
      <button class="add" data-act="import">Загрузить из копии</button>
      <div class="lab">Копию стоит делать хоть иногда: если очистить данные браузера, всё пропадёт.</div>
    </div>

    <div class="card">
      <div class="caps">Версия</div>
      <div class="row between"><span class="ink">Сборка</span><span class="lab">${BUILD}</span></div>
      <div class="lab">Приложение обновляется само при запуске. Если номер сборки не меняется после выхода новой версии — обнови вручную.</div>
      <button class="add" data-act="refresh">Обновить приложение</button>
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
