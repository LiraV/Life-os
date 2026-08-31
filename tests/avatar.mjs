// Аватар профиля: выбор, сохранение, отображение в профиле и ящике.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
p.on('response', r => { if (r.url().includes('/avatars/') && !r.ok()) errs.push('404: ' + r.url()); });
let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.waitForTimeout(1100);
await p.locator('[data-sheet="secondary"]').click({ timeout: 2500 }).catch(() => {});
await p.waitForTimeout(300);

await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
console.log('1) по умолчанию буква:', await p.locator('.avatar:not(.has-img)').first().innerText());

// мини-окно из «изменить»
await p.locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
console.log('2) в «Персонаже» есть строка аватара:', await p.locator('.av-row').count() === 1);
await p.locator('.av-row').click(); await p.waitForTimeout(600);
console.log('3) мини-окно:', await p.locator('.sheet-title').innerText(), '| вариантов:', await p.locator('.av-pick').count());
console.log('   картинки грузятся:', await p.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.av-pick img')].slice(0, 12);
  // Ждём каждую: «ещё не загрузилась — значит целая» скрывало бы битые.
  await Promise.all(imgs.map(i => (i.complete ? null : new Promise(r => {
    i.addEventListener('load', r, { once: true });
    i.addEventListener('error', r, { once: true });
    setTimeout(r, 15000);
  }))));
  return imgs.every(i => i.naturalWidth > 0);
}));

await p.locator('.av-pick').nth(3).click(); await p.waitForTimeout(700);
let s = await st();
console.log('4) выбрано:', s.user.avatar, '| вернулись в «Персонаж»:', await p.locator('.sheet-title').innerText());
console.log('   в строке уже новый:', await p.locator('.av-row .avatar.has-img').count() === 1);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
console.log('5) в профиле картинка:', await p.locator('.avatar.has-img img').count() > 0);

// тап по кружку открывает то же окно
await p.locator('[data-act="avatar"]').first().click(); await p.waitForTimeout(600);
console.log('6) из кружка тоже открылось:', await p.locator('.av-grid').count() === 1);
await p.locator('.av-pick').first().click(); await p.waitForTimeout(700);
console.log('   обратно к букве:', JSON.stringify((await st()).user.avatar), '| окно закрылось:', await p.locator('.sheet').count() === 0);

// имя не теряется при заходе в аватары
await p.locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="name"]', 'Лера');
await p.locator('.av-row').click(); await p.waitForTimeout(600);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(600);
console.log('7) имя пережило заход в аватары:', await p.inputValue('.sheet input[name="name"]'));
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// выбор переживает перезапуск
await p.locator('[data-act="avatar"]').first().click(); await p.waitForTimeout(600);
await p.locator('.av-pick').nth(12).click(); await p.waitForTimeout(700);
const chosen = (await st()).user.avatar;
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
console.log('8) после перезапуска:', (await st()).user.avatar === chosen ? chosen : '✗ сбросилось');
console.log('   всего портретов:', (await p.evaluate(async () => (await import('/app/js/avatars.js')).AVATARS.length)));
console.log('ошибки:', errs.length ? errs : 'нет');
await p.locator('[data-act="avatar"]').first().click(); await p.waitForTimeout(900);
await p.screenshot({ path: 'avatar.png' });
// ── набор портретов сменился, прежний выбор не пропал ───────────
// Прежние аватарки резали слишком плотно, и круглая маска срезала макушки.
// Новый набор нарезан с полями и лежит под своими именами: перенумеровать
// старые значило бы подменить человеку лицо втихую.
{
  const list = await p.evaluate(async () => {
    const a = await import('/app/js/avatars.js');
    return { набор: a.AVATARS, старыйОткрывается: a.avatarSrc('a17'), новыйОткрывается: a.avatarSrc('b7'),
      чужойНет: a.avatarSrc('b99') };
  });
  ok('в выборе — новый набор', list.набор.length === 40 && list.набор[0] === 'b1', list.набор.slice(0, 3).join(','));
  ok('прежде выбранный портрет по-прежнему открывается', list.старыйОткрывается === 'assets/avatars/a17.webp', list.старыйОткрывается);
  ok('новый открывается', list.новыйОткрывается === 'assets/avatars/b7.webp', list.новыйОткрывается);
  ok('несуществующий не выдумывается', list.чужойНет === '', JSON.stringify(list.чужойНет));

  // Предыдущая часть могла оставить шторку открытой — она перехватывает нажатия.
  await p.evaluate(async () => { (await import('/app/js/ui.js')).closeSheet(); });
  await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(600);
  await p.locator('.avatar').first().click(); await p.waitForTimeout(1500);
  const broken = await p.evaluate(() => [...document.querySelectorAll('.av-pick img')].filter(i => !i.naturalWidth).length);
  ok('все портреты в выборе загрузились', broken === 0, String(broken));
  await p.locator('[data-sheet="secondary"], [data-sheet="save"]').first().click().catch(() => {});
}

await b.close();
