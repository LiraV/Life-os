// Смена иконки приложения: выбор виден, сохраняется, подменяет ссылки в документе.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
// Ждём, пока все картинки на странице решатся — загрузятся или не смогут.
// Проверять naturalWidth сразу нельзя: под нагрузкой картинка ещё в пути, и
// набор мигает на ровном месте.
const imagesSettled = pg => pg.evaluate(() => Promise.all([...document.images].map(i => (
  i.complete ? null : new Promise(r => {
    i.addEventListener('load', r, { once: true });
    i.addEventListener('error', r, { once: true });
    setTimeout(r, 15000);
  })
))).then(() => true));


const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const links = () => p.evaluate(() => ({
  icon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
  apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
  man: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
  theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
}));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const cur = JSON.parse(localStorage.getItem('lifeos.state'));
  (cur.ui ||= {}).tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(cur));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);

await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(700);
const picks = p.locator('.apps .icon-pick');
const N = 11;
ok(`в настройках ${N} обложек`, await picks.count() === N, String(await picks.count()));
// каждая обложка должна вести на существующий манифест — иначе выбор молча ничего не даст
const keys = await picks.evaluateAll(els => els.map(e => e.dataset.id));
for (const k of keys) {
  const url = k === 'pearl' ? 'manifest.webmanifest' : `manifest-${k}.webmanifest`;
  const st2 = await p.evaluate(u => fetch(u).then(r => r.status), url);
  if (st2 !== 200) ok(`манифест ${k}`, false, String(st2));
}
ok('у каждой обложки есть свой манифест', true, keys.join(', '));
ok('по умолчанию отмечена жемчужина', await p.locator('.apps .icon-pick.on').getAttribute('data-id') === 'pearl');

// картинки должны существовать, а не висеть битыми
await imagesSettled(p);
const broken = await p.locator('.apps .icon-pick img').evaluateAll(els => els.filter(e => !e.naturalWidth).map(e => e.getAttribute('src')));
ok('все обложки загрузились', broken.length === 0, broken.join(', '));

const before = await links();
ok('на старте favicon от жемчужины', /pearl-192/.test(before.icon), before.icon);
ok('на старте базовый манифест', before.man === 'manifest.webmanifest', before.man);

// ── выбор
await p.locator('.apps .icon-pick[data-id="lotus"]').click();
await p.waitForTimeout(500);
const after = await links();
ok('favicon сменился сразу', /lotus-192/.test(after.icon), after.icon);
ok('иконка «Домой» сменилась', /lotus-180/.test(after.apple), after.apple);
ok('манифест подменён', after.man === 'manifest-lotus.webmanifest', after.man);
ok('цвет окна приложения не тронут', after.theme === before.theme, `${before.theme} → ${after.theme}`);
ok('выбор записан', (await st()).ui.icon === 'lotus', (await st()).ui.icon);
ok('отметка переехала', await p.locator('.apps .icon-pick.on').getAttribute('data-id') === 'lotus');

// ── переживает перезагрузку
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const back = await links();
ok('после перезапуска иконка та же', /lotus-192/.test(back.icon) && back.man === 'manifest-lotus.webmanifest', `${back.icon} · ${back.man}`);

// ── манифест отдаётся и правильно устроен
const man = await p.evaluate(async () => (await fetch('manifest-lotus.webmanifest')).json());
ok('манифест — валидный JSON с иконками', man.icons.length === 3 && man.icons.every(i => /lotus/.test(i.src)), JSON.stringify(man.icons.map(i => i.src)));
ok('id прежний — это то же приложение', man.id === './index.html', String(man.id));
ok('start_url и scope не съехали', man.start_url === './index.html' && man.scope === './');
ok('есть маскируемая иконка', man.icons.some(i => i.purpose === 'maskable'));

// ── мусор в состоянии не ломает вид
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.icon = 'нет-такой';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(600);
const junk = await links();
ok('чужое значение откатывается к жемчужине', /pearl-192/.test(junk.icon) && junk.man === 'manifest.webmanifest', `${junk.icon} · ${junk.man}`);
ok('и в списке отмечена она же', await p.locator('.apps .icon-pick.on').getAttribute('data-id') === 'pearl');

// ── старые данные без поля иконки
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  delete s.ui.icon;
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
ok('без поля иконки приложение живо', /pearl-192/.test((await links()).icon));

await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(600);
await p.locator('.card', { hasText: 'ИКОНКА ПРИЛОЖЕНИЯ' }).screenshot({ path: 'appicon.png' });
console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
