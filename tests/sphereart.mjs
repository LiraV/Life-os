// Обложки своих сфер: выбор картинки вместо эмодзи — в форме, на плитке и в шапке.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const cur = JSON.parse(localStorage.getItem('lifeos.state'));
  (cur.ui ||= {}).tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(cur));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);

await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(400);
ok('у заготовок есть картинки', await p.locator('.tpl-art').count() === 7, String(await p.locator('.tpl-art').count()));
// Ждём, пока картинки догрузятся: под нагрузкой это не мгновенно, и раньше
// проверка ловила не битый файл, а собственную спешку.
const settled = sel => p.waitForFunction(
  s2 => [...document.querySelectorAll(s2)].every(e => e.complete), sel, { timeout: 15000 }).catch(() => {});
await settled('.tpl-art');
const tplBroken = await p.locator('.tpl-art').evaluateAll(els => els.filter(e => !e.naturalWidth).map(e => e.getAttribute('src')));
ok('картинки заготовок загрузились', tplBroken.length === 0, tplBroken.join(', '));

await p.locator('[data-act="tpl"][data-v="practice"]').click(); await p.waitForTimeout(450);
ok('поля со значком больше нет', await p.locator('input[name="icon"]').count() === 0);
const pics = p.locator('.opt.pic');
ok('в форме есть выбор обложки', await pics.count() === 14, String(await pics.count()));
await settled('.opt.pic img');
const picBroken = await p.locator('.opt.pic img').evaluateAll(els => els.filter(e => !e.naturalWidth).map(e => e.getAttribute('src')));
ok('все обложки в наборе загрузились', picBroken.length === 0, picBroken.join(', '));
await p.locator('.opts.pics').screenshot({ path: 'sphereart-pick.png' });
// встроенные сферы своих картинок не теряют: у них путь свой, не через ключ
const built = await p.evaluate(async () => {
  const st = await import('./app/js/store.js');
  return st.SPHERES.map(x => x.img);
});
// Важно не то, какой это файл, а то, что путь у встроенной сферы свой и не
// выводится из ключа обложки. «Тело» пришло с широкой картинкой — это нормально.
ok('у встроенных сфер картинки на месте', built.every(x => /^assets\/.+\.(png|webp)$/.test(x)), built.join(', '));
ok('заготовка подставила свою обложку', await p.locator('.opt.pic.on').getAttribute('data-value') === 'move',
  await p.locator('.opt.pic.on').getAttribute('data-value'));

// выбираем другую и создаём
await p.locator('.opt.pic[data-value="read"]').click(); await p.waitForTimeout(200);
ok('отметка переехала на выбранную', await p.locator('.opt.pic.on').getAttribute('data-value') === 'read');
await p.fill('input[name="name"]', 'Музыка');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);

const own = (await st()).customSpheres.find(x => x.name === 'Музыка');
ok('сфера создалась с ключом обложки', own?.art === 'read', JSON.stringify(own?.art));
ok('путь к файлу в данных не хранится', !JSON.stringify(own).includes('assets/'), JSON.stringify(own).slice(0, 90));

// после создания приложение открывает саму сферу — сперва смотрим её шапку
const hero = p.locator('.hero-img');
ok('в шапке сферы выбранная обложка', /spheres\/read\.webp/.test(await hero.getAttribute('src')), await hero.getAttribute('src'));
ok('шапка не битая', await hero.evaluate(e => e.naturalWidth > 0));
await p.screenshot({ path: 'sphereart-hero.png' });

await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
const tile = p.locator('.tile', { hasText: 'Музыка' });
ok('на плитке картинка, а не эмодзи', await tile.locator('img').count() === 1 && await tile.locator('.tile-emoji').count() === 0);
const src = await tile.locator('img').getAttribute('src');
ok('плитка взяла выбранную обложку', /spheres\/read\.webp/.test(src), src);
ok('картинка на плитке не битая', await tile.locator('img').evaluate(e => e.naturalWidth > 0));
await tile.click(); await p.waitForTimeout(600);

// правка: обложку можно сменить
await p.locator('[data-act="sphereedit"]').click(); await p.waitForTimeout(450);
ok('при правке отмечена текущая обложка', await p.locator('.opt.pic.on').getAttribute('data-value') === 'read');
await p.locator('.opt.pic[data-value="money"]').click(); await p.waitForTimeout(150);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
ok('смена обложки сохранилась', (await st()).customSpheres.find(x => x.name === 'Музыка')?.art === 'money');
ok('и видна в шапке', /spheres\/money\.webp/.test(await p.locator('.hero-img').getAttribute('src')));

// ── старая сфера без обложки: рисуется прежний значок, ничего не выдумываем
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.customSpheres.push({ key: 'cold1', name: 'Старая', icon: '🎹', mech: 'своя', kinds: ['steps'], unit: 'раз', archived: false });
  s.spheres.cold1 = { items: [], note: '', log: {}, shelf: [], coll: [], board: [], meas: [] };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
const oldTile = p.locator('.tile', { hasText: 'Старая' });
ok('старой сфере обложку не придумали', await oldTile.locator('.tile-emoji').innerText() === '🎹');
ok('и картинки у неё нет', await oldTile.locator('img').count() === 0);

// ── чужой ключ обложки не рисует чужую картинку
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.customSpheres.find(x => x.key === 'cold1').art = 'нет-такой';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
const junkImgs = await p.locator('.tile', { hasText: 'Старая' }).locator('img').count();
ok('неизвестный ключ не подставляет чужую обложку', junkImgs === 0, String(junkImgs));

await p.screenshot({ path: 'sphereart-tiles.png' });
console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
