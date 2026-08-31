// Блог: конвейер постов, ритм, подписчики, просмотры и связки.
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
const blog = () => p.evaluate(() => { const x = JSON.parse(localStorage.getItem('lifeos.state')); return x.blog; });
const scr = () => p.locator('.scr').innerText();
const open = async () => { await p.evaluate(() => { location.hash = '#/spheres/blog'; }); await p.waitForTimeout(600); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);

// ── 1. пустая сфера
await open();
let t = await scr();
ok('есть ритм', /РИТМ/i.test(t));
ok('пустой месяц назван без упрёка', /не упрёк/i.test(t), (t.match(/.{0,40}не упрёк.{0,20}/) || [''])[0]);
ok('есть четыре стадии', ['Идеи', 'Черновики', 'Готовы', 'Опубликовано'].every(x => new RegExp(x, 'i').test(t)));
ok('старой «фермы идей» больше нет', !/ферма идей|росток|бутон/i.test(t));
ok('общей карточки этапов у блога нет', !/^ЭТАПЫ$/im.test(t));

// ── 2. пост от идеи до публикации
await p.locator('[data-act="postadd"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Как я веду систему');
await p.locator('.opts[data-name="place"] .opt[data-value="tg"]').click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
let bl = await blog();
ok('пост создался идеей', bl.posts.length === 1 && bl.posts[0].stage === 'idea', JSON.stringify(bl.posts[0]?.stage));
ok('площадка сохранилась', bl.posts[0].place === 'tg');
ok('рубрик у нового поста нет — их не выдумывают', JSON.stringify(bl.posts[0].rubrics) === '[]', JSON.stringify(bl.posts[0].rubrics));
ok('дату выхода идее не придумали', bl.posts[0].day === '', JSON.stringify(bl.posts[0].day));
ok('рубрикатор на экране есть', /РУБРИКАТОР/i.test(await scr()));

const pill = p.locator('.chk-row', { hasText: 'Как я веду систему' }).locator('.pill');
await pill.click(); await p.waitForTimeout(450);
ok('тап двигает в черновики', (await blog()).posts[0].stage === 'draft');
await pill.click(); await p.waitForTimeout(450);
ok('дальше — готов', (await blog()).posts[0].stage === 'ready');
await pill.click(); await p.waitForTimeout(500);
bl = await blog();
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
ok('дальше — опубликовано', bl.posts[0].stage === 'out');
ok('день выхода проставился сегодняшним', bl.posts[0].day === today, bl.posts[0].day);
ok('публикация попала в дневник', (await st()).diary.some(d => /опубликовано/.test(d.text)));

t = await scr();
ok('ритм посчитал пост', /1 пост в /.test(t), (t.match(/.{0,30}пост.{0,30}/) || [''])[0]);
ok('разбивка по площадкам есть', /Телеграм 1/.test(t) && /Инстаграм 0/.test(t));

// ── 3. свой день выхода не перетирается
await p.locator('[data-act="postadd"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Пост про осень');
await p.fill('input[name="day"]', '2026-09-03');
await p.locator('.opts[data-name="stage"] .opt[data-value="ready"]').click();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
t = await scr();
ok('готовый с будущей датой — в «скоро выходит»', /СКОРО ВЫХОДИТ/i.test(t));
ok('и сказано, почему не в «Дне»', /не в «Дне»|незачем маячить/i.test(t));
const pill2 = p.locator('.card', { hasText: 'Готовы' }).locator('.chk-row', { hasText: 'Пост про осень' }).locator('.pill');
await pill2.click(); await p.waitForTimeout(500);
const autumn = (await blog()).posts.find(x => x.title === 'Пост про осень');
ok('свой день выхода при публикации сохранён', autumn.day === '2026-09-03', autumn.day);

// ── 4. рабочая дата не лезет в «День»
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
ok('постов в «Дне» нет', !/Пост про осень|Как я веду систему/.test(await scr()));

// ── 5. просмотры: лучший за месяц и рекорд
await open();
await p.locator('.chk-row', { hasText: 'Как я веду систему' }).locator('.q-edit').click(); await p.waitForTimeout(450);
await p.fill('input[name="views"]', '820');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
t = await scr();
ok('просмотры появились', /ПРОСМОТРЫ/i.test(t) && /820/.test(t));
ok('и названы лучшим за месяц', /лучший за месяц/.test(t));

// рекорд прошлого года не должен считаться лучшим за этот месяц
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.blog.posts.push({ id: 'old1', title: 'Старый хит', place: 'ig', stage: 'out', day: '2025-05-04',
    link: '', views: 9000, format: '', rubrics: [], blocks: [], seed: '', note: '', movedAt: '2025-05-04' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700); await open();
t = await scr();
ok('рекорд за всё время — старый хит', /Старый хит[\s\S]{0,40}9000 · рекорд/.test(t), (t.match(/.{0,30}рекорд.{0,10}/) || [''])[0]);
ok('лучший за месяц остался свой', /Как я веду систему[\s\S]{0,40}820 · лучший за месяц/.test(t));

// ── 6. подписчики
await p.locator('[data-act="subsmark"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="ig"]', '1200');
await p.fill('input[name="tg"]', '340');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
t = await scr();
ok('подписчики записались', /1540 всего/.test(t), (t.match(/.{0,20}всего.{0,10}/) || [''])[0]);
ok('пока нет второй отметки — нет и разницы', !/\(\+/.test(t));

await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.blog.subs.unshift({ id: 'was', date: '2026-07-01', ig: 1100, tg: 300 });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700); await open();
t = await scr();
ok('разница с прошлой отметкой посчиталась', /Инстаграм 1200 \(\+100\)/.test(t) && /Телеграм 340 \(\+40\)/.test(t),
  (t.match(/Инстаграм.{0,40}/) || [''])[0]);

// пустое поле не превращается в ноль
await p.locator('[data-act="subsmark"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="date"]', '2026-08-30');
await p.fill('input[name="ig"]', '1250');
await p.fill('input[name="tg"]', '');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
// Ищем по дате, а не по месту в списке: отметки отсортированы по дате, и
// «последняя» зависит от того, какое сегодня число.
const last = (await blog()).subs.find(x => x.date === '2026-08-30');
ok('незаполненное осталось пустым, а не нулём', last?.tg === null && last?.ig === 1250, JSON.stringify(last));
ok('и разница у телеграма считается от прошлой его отметки', /Телеграм 340|Телеграм —/.test(await scr()));

// ── 7. цель с автосчётом из постов
ok('источник «Постов» предлагается', await p.evaluate(async () => {
  const sel = await import('./app/js/selectors.js');
  return sel.sourcesOf('blog').some(x => x.key === 'posts');
}));
ok('автосчёт считает вышедшие за год', await p.evaluate(async () => {
  const sel = await import('./app/js/selectors.js');
  const y = new Date().getFullYear();
  return sel.autoCount({ horizon: 'year', period: String(y), src: { kind: 'posts', ref: '' } });
}) === 2, 'ждали 2');

// ── 8. плитка и трекер
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(600);
// сентябрьский пост в августовский месяц не попадает — считаем только вышедшие в этом
ok('на плитке блога — посты за месяц', /1 пост за месяц/.test(await p.locator('.tile', { hasText: 'Блог' }).innerText()),
  await p.locator('.tile', { hasText: 'Блог' }).innerText());
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
ok('в трекере есть строка постов', await p.locator('.tr tbody tr', { hasText: /посты/i }).count() === 1);

// ── 9. перенос старых идей
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.v = 39;
  s.blog = { posts: [], subs: [] };
  s.spheres.blog = { items: [
    { id: 'i1', title: 'Идея', done: false, stage: 0 },
    { id: 'i2', title: 'Почти готово', done: false, stage: 2 },
    { id: 'i3', title: 'Вышло', done: true, stage: 2, doneAt: '2026-06-10' },
  ], note: '', log: {}, shelf: [], coll: [], board: [], meas: [] };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
bl = await blog();
const by = n => bl.posts.find(x => x.title === n);
ok('старые идеи переехали в посты', bl.posts.length === 3, String(bl.posts.length));
ok('стадии разложены по смыслу', by('Идея')?.stage === 'idea' && by('Почти готово')?.stage === 'ready' && by('Вышло')?.stage === 'out',
  bl.posts.map(x => `${x.title}:${x.stage}`).join(', '));
ok('дата закрытия стала днём выхода', by('Вышло')?.day === '2026-06-10', by('Вышло')?.day);
ok('незакрытым дату не выдумали', by('Идея')?.day === '' && by('Почти готово')?.day === '');
ok('старый список этапов опустел', ((await st()).spheres.blog.items || []).length === 0);
await open();
await p.screenshot({ path: 'blog.png', fullPage: true });

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
