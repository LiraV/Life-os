// Блог: стадии поста и площадки. Отдельный модуль без импортов — его тянут
// и хранилище, и селекторы, и экран сферы.
//
// Стадий четыре, и первая из них — банк идей. Идея не долг: она лежит в
// первой колонке столько, сколько лежит, и никто её этим не попрекает.

export const BLOG_STAGES = [
  { key: 'idea',  name: 'Идеи',         hint: 'из чего может вырасти пост' },
  { key: 'draft', name: 'Черновики',    hint: 'уже пишется' },
  { key: 'ready', name: 'Готовы',       hint: 'ждут выхода' },
  { key: 'out',   name: 'Опубликовано', hint: 'вышло' },
];

export const BLOG_PLACES = [
  { key: 'ig',   name: 'Инстаграм', short: 'ИГ' },
  { key: 'tg',   name: 'Телеграм',  short: 'ТГ' },
  { key: 'both', name: 'Обе',       short: 'ИГ+ТГ' },
];

/** Площадки, на которых человек считает подписчиков: «обе» — не площадка. */
export const BLOG_FEEDS = BLOG_PLACES.filter(p => p.key !== 'both');

export const stageName = key => BLOG_STAGES.find(s => s.key === key)?.name || '';
export const placeName = key => BLOG_PLACES.find(p => p.key === key)?.name || '';
export const placeShort = key => BLOG_PLACES.find(p => p.key === key)?.short || '';
export const isOut = post => post?.stage === 'out';
/** Пост считается за площадку, если вышел на ней или на обеих. */
export const atPlace = (post, place) => !place || post.place === place || post.place === 'both';
