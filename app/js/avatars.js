// Аватар профиля. Картинки лежат в assets/avatars, в состоянии — только
// короткий ключ: так экспорт остаётся лёгким и не тащит в себе изображение.

export const AVATARS = [
  { id: 'a1', name: 'Рыжая' },
  { id: 'a2', name: 'Солнечная' },
  { id: 'a3', name: 'Книжный' },
  { id: 'a4', name: 'Спортивная' },
  { id: 'a5', name: 'В пальто' },
  { id: 'a6', name: 'С косой' },
  { id: 'a7', name: 'В худи' },
  { id: 'a8', name: 'Джинсовка' },
  { id: 'a9', name: 'Пикси' },
  { id: 'a10', name: 'Каре' },
];

export const avatarSrc = id => (AVATARS.some(a => a.id === id) ? `assets/avatars/${id}.webp` : '');

/** Кружок профиля: картинка, если выбрана, иначе первая буква имени. */
export const avatarHtml = (user, size = 42, cls = '') => {
  const src = avatarSrc(user.avatar);
  const letter = (user.name || '?').trim().charAt(0).toUpperCase();
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  return src
    ? `<div class="avatar has-img ${cls}" style="${style}"><img src="${src}" alt=""></div>`
    : `<div class="avatar ${cls}" style="${style}">${letter}</div>`;
};
