// Аватар профиля. Картинки лежат в assets/avatars, в состоянии — только
// короткий ключ вроде a12: так экспорт остаётся лёгким и не тащит в себе
// изображение. Подписей у портретов нет намеренно — с полусотней вариантов
// они превращают выбор в стену текста.

// Показываем набор «b»: те же лица, но нарезанные с полями — у прежних макушку
// срезала круглая маска. Прежние файлы остались на месте и по-прежнему
// открываются: у кого выбран старый портрет, тот его и видит. Новых имён не
// жалко, а перенумеровать значило бы подменить человеку лицо втихую.
const COUNT = 40;
export const AVATARS = Array.from({ length: COUNT }, (_, i) => `b${i + 1}`);

/** В выборе — только нынешний набор; открывается и прежний, если он выбран. */
export const hasAvatar = id => AVATARS.includes(id) || /^a([1-9]|[1-4]\d|50)$/.test(id || '');
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
