// Есть ли снаружи версия свежее той, что открыта сейчас.
//
// Приложение обновляется само, но только когда его закрывают и открывают
// заново. Вкладка, живущая с утра, продолжает работать на старом коде — и
// человек честно не понимает, почему обещанное не появилось. Поэтому
// спрашиваем у сервера номер сборки и, если он другой, говорим об этом вслух.

import { BUILD } from './version.js';

let latest = '';
let asking = false;

/** Номер новой сборки, если она есть. Пусто — открыта самая свежая. */
export const newBuild = () => (latest && latest !== BUILD ? latest : '');

/**
 * Спросить у сервера. Мимо кеша: смысл вопроса в том, что лежит снаружи, а не
 * в том, что браузер запомнил.
 */
export async function checkBuild() {
  if (asking) return '';
  asking = true;
  try {
    const url = new URL('app/js/version.js', document.baseURI);
    url.searchParams.set('v', Date.now());
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return '';
    const text = await r.text();
    const found = text.match(/BUILD\s*=\s*'([^']+)'/);
    latest = found ? found[1] : '';
    return newBuild();
  } catch {
    return '';   // нет сети — молчим, это не повод тревожить
  } finally {
    asking = false;
  }
}
