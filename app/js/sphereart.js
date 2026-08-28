// Картинки для оформления сфер. Свои сферы выбирают из этого набора вместо
// значка: обложка читается быстрее эмодзи и держит один вид с встроенными
// сферами, у которых картинка была с самого начала.
//
// Модуль намеренно ничего не импортирует: его тянет хранилище, и любой импорт
// отсюда обратно в хранилище замкнул бы кольцо.

export const SPHERE_ART = [
  { key: 'travel', name: 'Путешествие', src: 'assets/spheres/travel.webp' },
  { key: 'care',   name: 'Уход',        src: 'assets/spheres/care.webp' },
  { key: 'move',   name: 'Движение',    src: 'assets/spheres/move.webp' },
  { key: 'read',   name: 'Чтение',      src: 'assets/spheres/read.webp' },
  { key: 'money',  name: 'Деньги',      src: 'assets/spheres/money.webp' },
  { key: 'city',   name: 'Город',       src: 'assets/illustration_01.png' },
  { key: 'plan',   name: 'Календарь',   src: 'assets/illustration_02.png' },
  { key: 'note',   name: 'Дневник',     src: 'assets/illustration_03.png' },
  { key: 'tea',    name: 'Чай',         src: 'assets/illustration_04.png' },
  { key: 'map',    name: 'Карта',       src: 'assets/illustration_05.png' },
  { key: 'photo',  name: 'Фотоаппарат', src: 'assets/illustration_06.png' },
  { key: 'sign',   name: 'Указатель',   src: 'assets/illustration_07.png' },
  { key: 'window', name: 'Окно',        src: 'assets/illustration_09.png' },
  { key: 'balloon',name: 'Шар',         src: 'assets/illustration_10.png' },
];

export const DEFAULT_ART = 'city';

/** Путь к картинке. Неизвестный ключ — не картинка, а пусто: подставлять
 *  чужую обложку хуже, чем показать значок, который человек уже видел. */
export const artSrc = key => SPHERE_ART.find(a => a.key === key)?.src || '';
export const artName = key => SPHERE_ART.find(a => a.key === key)?.name || '';
