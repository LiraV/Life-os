// Иконка приложения. Выбор человека хранится в состоянии, а на странице
// подменяются ссылки: favicon, иконка для «На экран Домой» и манифест.
//
// Цвет в списке — только для подписи под картинкой; строку состояния
// приложения он не трогает: она принадлежит приложению, а не обложке.
//
// Честно про пределы: система запоминает иконку в момент установки. Уже
// стоящий на экране ярлык сам не перерисуется — его нужно поставить заново.
// В браузере и во вкладке иконка меняется сразу.

import { S, update } from './store.js';

export const APP_ICONS = [
  { key: 'pearl',  name: 'Жемчужина', theme: '#ac4439', note: 'та, что была с самого начала' },
  { key: 'spiral', name: 'Спираль',   theme: '#a93a3b', note: 'свет в глубине' },
  { key: 'moon',   name: 'Полумесяц', theme: '#f8bdb2', note: 'месяц и солнце' },
  { key: 'gate',   name: 'Врата',     theme: '#c95767', note: 'ступени к свету' },
  { key: 'petals', name: 'Лепестки',  theme: '#f39575', note: 'четыре доли' },
  { key: 'lotus',  name: 'Лотос',     theme: '#e89391', note: 'на воде' },
  { key: 'butterfly',name: 'Бабочка',  theme: '#f68d71', note: 'лёгкость' },
  { key: 'orbit',   name: 'Орбита',   theme: '#863855', note: 'жемчужина в кольцах' },
  { key: 'heart',   name: 'Сердце',   theme: '#ac375c', note: 'в тёплом круге' },
  { key: 'sunrise', name: 'Рассвет',  theme: '#f9c198', note: 'дорога к солнцу' },
  { key: 'citrus',  name: 'Долька',   theme: '#e85858', note: 'восемь частей' },
];

export const DEFAULT_ICON = 'pearl';

/** Ключ иконки с проверкой: чужое или стёртое значение не должно ломать вид. */
export function iconKey() {
  const k = S.ui?.icon;
  return APP_ICONS.some(i => i.key === k) ? k : DEFAULT_ICON;
}

export const iconById = key => APP_ICONS.find(i => i.key === key) || APP_ICONS[0];

const setLink = (rel, href) => {
  const el = document.querySelector(`link[rel="${rel}"]`);
  if (el) el.setAttribute('href', href);
};

/** Проставить выбранную иконку в документ. Вызывается при запуске и после выбора. */
export function applyAppIcon(key = iconKey()) {
  const ico = iconById(key);
  setLink('icon', `icons/${ico.key}-192.png`);
  setLink('apple-touch-icon', `icons/${ico.key}-180.png`);
  // Манифест подменяем целиком: браузер читает иконки и цвет именно оттуда.
  setLink('manifest', ico.key === DEFAULT_ICON ? 'manifest.webmanifest' : `manifest-${ico.key}.webmanifest`);
}

export function setAppIcon(key) {
  if (!APP_ICONS.some(i => i.key === key)) return;
  update(s => { s.ui.icon = key; });
  applyAppIcon(key);
}
