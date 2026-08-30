// «Забота»: список не навязывается, а предлагается — и подбирается по профилю.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

ok('новому человеку ничего не навязано', (await st()).care.items.length === 0);
ok('и чужая кличка питомца не подставлена', !(await st()).care.pet.name);

const names = () => p.evaluate(async () => (await import('./app/js/carelib.js')).careSuggestions().map(x => x.name));
const setUser = o => p.evaluate(async x => {
  const { update } = await import('./app/js/store.js');
  update(s => Object.assign(s.user, x));
}, o);

// пол
await setUser({ sex: 'f', birth: '' });
let n = await names();
ok('женщине предлагается гинеколог', n.includes('Гинеколог'));
ok('и не предлагается уролог', !n.includes('Уролог'));
await setUser({ sex: 'm' });
n = await names();
ok('мужчине предлагается уролог', n.includes('Уролог'));
ok('и не предлагается гинеколог', !n.includes('Гинеколог'));

// возраст
ok('без даты рождения возрастное не предлагается', !n.includes('Колоноскопия') && !n.includes('ПСА'));
await setUser({ birth: '1996-03-01' });   // 30 лет
n = await names();
ok('в 30 колоноскопия не предлагается', !n.includes('Колоноскопия'));
await setUser({ birth: '1970-03-01' });   // 56 лет
n = await names();
ok('в 56 предлагается колоноскопия', n.includes('Колоноскопия'));
ok('и ПСА для мужчины', n.includes('ПСА'));
await setUser({ sex: 'f' });
n = await names();
ok('женщине в 56 предлагается маммография', n.includes('Маммография'));
ok('а УЗИ молочных желёз до 39 — нет', !n.includes('УЗИ молочных желёз'));

// питомец
ok('без питомца дела питомца не предлагаются', !n.includes('Вакцина питомцу'));
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.care.pet.name = 'Бусик'; });
});
ok('с питомцем — предлагаются', (await names()).includes('Вакцина питомцу'));

// добавление через экран
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(700);
const scr = await p.locator('.scr').innerText();
ok('пустая «Забота» предлагает собрать список', /Собрать список/i.test(scr));
await p.locator('[data-act="suggest"]').first().click(); await p.waitForTimeout(600);
const sheet = await p.locator('.sheet').innerText();
ok('в шторке сказано, что это не назначения', /не назначения/.test(sheet));
const checked = await p.locator('.sheet input[type=checkbox]:checked').count();
const total = await p.locator('.sheet input[type=checkbox]').count();
ok(`отмечена часть, а не всё (${checked} из ${total})`, checked > 0 && checked < total);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const items = (await st()).care.items;
ok(`добавилось ровно отмеченное (${items.length})`, items.length === checked);
ok('«последний раз» никому не выдуман', items.every(i => !i.last));
ok('«Замеры тела» пришли со связью', items.find(i => i.name === 'Замеры тела')?.link === 'measure');

// повторное предложение не двоит
await p.evaluate(() => { location.hash = '#/care'; }); await p.waitForTimeout(600);
const left = await names();
ok('уже добавленное больше не предлагается', !left.includes('Терапевт'));

// ничего не мешает завести своё и удалить любое
await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  update(s => { s.care.items.push({ id: 'my1', name: 'Своё дело', group: 'home', every: 2, anchor: 0, last: '', log: [], cost: 0, note: '', link: '' }); });
});
await p.waitForTimeout(300);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.care.items = s.care.items.filter(x => x.name !== 'Терапевт'); });
});
await p.waitForTimeout(300);
const after = (await st()).care.items.map(i => i.name);
ok('своё дело добавилось', after.includes('Своё дело'));
ok('удалённое ушло', !after.includes('Терапевт'));
ok('и снова предлагается', (await names()).includes('Терапевт'));

// старым пользователям список не тронут
await p.evaluate(() => localStorage.setItem('lifeos.state', JSON.stringify({
  v: 27, onboarded: true, ui: { tips: 'off' },
  care: { items: [{ id: 'x', name: 'Кровь на литий', group: 'health', every: 3, anchor: 3, last: '', log: [] }], pet: { name: 'Бусик' } },
})));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(800);
const old = (await st()).care;
ok('у прежнего пользователя список остался как был', old.items.length === 1 && old.items[0].name === 'Кровь на литий');
ok('и питомец на месте', old.pet.name === 'Бусик');

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
