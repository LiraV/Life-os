// Аватар профиля. Картинки лежат в assets/avatars, в состоянии — только
// короткий ключ вроде a12: так экспорт остаётся лёгким и не тащит в себе
// изображение. Подписей у портретов нет намеренно — с полусотней вариантов
// они превращают выбор в стену текста.

const COUNT = 50;
export const AVATARS = Array.from({ length: COUNT }, (_, i) => `a${i + 1}`);
export const hasAvatar = id => AVATARS.includes(id);
export const avatarSrc = id => (hasAvatar(id) ? `assets/avatars/${id}.webp` : '');

/** Кружок профиля: картинка, если выбрана, иначе первая буква имени. */
export const avatarHtml = (user, size = 42, cls = '') => {
  const src = avatarSrc(user.avatar);
  const letter = (user.name || '?').trim().charAt(0).toUpperCase();
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  return src
    ? `<div class="avatar has-img ${cls}" style="${style}"><img src="${src}" alt=""></div>`
    : `<div class="avatar ${cls}" style="${style}">${letter}</div>`;
};
