// Темы приложения. Тема — это только набор переменных в CSS; здесь лежит
// список и то, как он проставляется в документ.
//
// Цвет строки состояния принадлежит теме, а не иконке: он красит рамку
// приложения, поэтому меняется вместе с фоном.

import { S, update } from './store.js';

export const THEMES = [
  { key: 'dawn',  name: 'Рассвет', note: 'та, что была',  bar: '#f3dfdc', dot: ['#f3dfdc', '#a63a35'] },
  { key: 'night', name: 'Ночь',    note: 'тёмная',        bar: '#272029', dot: ['#272029', '#d9776c'] },
  { key: 'sage',  name: 'Шалфей',  note: 'зелёная',       bar: '#e6ece2', dot: ['#e6ece2', '#4e7a52'] },
  { key: 'sea',   name: 'Море',    note: 'холодная',      bar: '#dfe8ef', dot: ['#dfe8ef', '#31688f'] },
  { key: 'plum',  name: 'Слива',   note: 'фиолетовая',    bar: '#ece1ee', dot: ['#ece1ee', '#7a4180'] },
  { key: 'sand',  name: 'Песок',   note: 'тёплая, тихая', bar: '#f0e9de', dot: ['#f0e9de', '#8a6a3c'] },
];

export const DEFAULT_THEME = 'dawn';

/** Ключ темы с проверкой: чужое значение не должно ломать вид. */
export function themeKey() {
  const k = S.ui?.theme;
  return THEMES.some(t => t.key === k) ? k : DEFAULT_THEME;
}

export const themeById = key => THEMES.find(t => t.key === key) || THEMES[0];

/** Проставить тему в документ. Рассвет — без атрибута: это :root как есть. */
export function applyTheme(key = themeKey()) {
  const t = themeById(key);
  const root = document.documentElement;
  if (t.key === DEFAULT_THEME) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t.key);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar);
}

export function setTheme(key) {
  if (!THEMES.some(t => t.key === key)) return;
  update(s => { s.ui.theme = key; });
  applyTheme(key);
}
