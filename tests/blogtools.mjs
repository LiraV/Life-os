// Инструменты блога: распаковка, упаковка, рубрикатор, форматы.
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
const blog = async () => (await st()).blog;
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
await open();

// ── 1. форматы заведены по умолчанию
let bl = await blog();
ok('форматы есть из коробки', bl.formats.length === 6, bl.formats.map(f => f.name).join(', '));
ok('рубрик по умолчанию нет — их не выдумывают', bl.rubrics.length === 0);

// ── 2. распаковка
let t = await scr();
ok('карточка распаковки на экране', /РАСПАКОВКА/i.test(t));
ok('сказано, что вопрос сам ничего не создаёт', /сам ничего не создаёт/.test(t));
const q1 = (await p.locator('.card', { hasText: 'Распаковка' }).locator('.ink').first().innerText()).trim();
await p.locator('[data-act="unpacknext"]').click(); await p.waitForTimeout(400);
const q2 = (await p.locator('.card', { hasText: 'Распаковка' }).locator('.ink').first().innerText()).trim();
ok('вопрос меняется', q1 !== q2, `${q1.slice(0, 30)} → ${q2.slice(0, 30)}`);
ok('идей от перелистывания не завелось', (await blog()).posts.length === 0);

await p.locator('[data-act="unpacktake"]').click(); await p.waitForTimeout(450);
ok('«взять» открывает форму с вопросом', (await p.locator('.sheet').innerText()).includes('Из распаковки'));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
bl = await blog();
ok('идея завелась из вопроса', bl.posts.length === 1 && bl.posts[0].title === q2, bl.posts[0]?.title?.slice(0, 40));
ok('вопрос сохранён рядом с идеей', bl.posts[0].seed === q2);
ok('и она именно идея', bl.posts[0].stage === 'idea');

// весь список вопросов
await p.locator('[data-act="unpackall"]').click(); await p.waitForTimeout(450);
const qs = await p.locator('.sheet [data-act="uq"]').count();
ok('в списке все 48 вопросов', qs === 48, String(qs));
ok('вопросы разложены по группам', /Ошибки/.test(await p.locator('.sheet').innerText()));
await p.locator('[data-sheet="close"]').click().catch(() => {});
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 3. рубрикатор
await open();
await p.locator('[data-act="rubrics"]').click(); await p.waitForTimeout(400);
await p.fill('.sheet [data-field="lsnew"]', 'Система');
await p.locator('.sheet [data-act="ls-add"]').click(); await p.waitForTimeout(450);
await p.fill('.sheet [data-field="lsnew"]', 'Быт');
await p.locator('.sheet [data-act="ls-add"]').click(); await p.waitForTimeout(450);
bl = await blog();
ok('рубрики завелись', bl.rubrics.length === 2, bl.rubrics.map(r => r.name).join(', '));
await p.fill('.sheet [data-field="lsnew"]', 'система');
await p.locator('.sheet [data-act="ls-add"]').click(); await p.waitForTimeout(450);
ok('тёзка не заводится', (await blog()).rubrics.length === 2);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 4. пост: формат, рубрики, упаковка
await open();
await p.locator('[data-act="postadd"]').click(); await p.waitForTimeout(450);
await p.fill('input[name="title"]', 'Как я веду систему');
const fmtId = (await blog()).formats.find(f => f.name === 'Рилс').id;
await p.locator(`.opts[data-name="format"] .opt[data-value="${fmtId}"]`).click(); await p.waitForTimeout(200);
const rubId = (await blog()).rubrics.find(r => r.name === 'Система').id;
await p.locator(`#rub_pick .pill[data-v="${rubId}"]`).click(); await p.waitForTimeout(300);
ok('рубрика отметилась', await p.locator(`#rub_pick .pill[data-v="${rubId}"]`).evaluate(e => e.classList.contains('on')));

await p.locator('.sheet [data-act="pktpl"][data-v="reels"]').click(); await p.waitForTimeout(400);
ok('скелет рилса подставился', await p.locator('.sheet .cl-item').count() === 5, String(await p.locator('.sheet .cl-item').count()));
await p.locator('.sheet [data-act="pktpl"][data-v="reels"]').click(); await p.waitForTimeout(400);
ok('повторное нажатие не плодит дубли', await p.locator('.sheet .cl-item').count() === 5);
await p.fill('.sheet [data-field="pknew"]', 'Свой пункт');
await p.locator('.sheet [data-act="pkadd"]').click(); await p.waitForTimeout(400);
ok('свой пункт дописался', await p.locator('.sheet .cl-item').count() === 6);
await p.locator('.sheet .cl-item').first().locator('.check').click(); await p.waitForTimeout(350);
ok('пункт отмечается', await p.locator('.sheet .cl-item.done').count() === 1);
ok('название не потерялось при перерисовке', await p.inputValue('input[name="title"]') === 'Как я веду систему');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);

bl = await blog();
const post = bl.posts.find(x => x.title === 'Как я веду систему');
ok('формат сохранён', post.format === fmtId);
ok('рубрика сохранена', JSON.stringify(post.rubrics) === JSON.stringify([rubId]));
ok('структура сохранена с отметкой', post.blocks.length === 6 && post.blocks.filter(x => x.done).length === 1,
  `${post.blocks.length} пунктов, отмечено ${post.blocks.filter(x => x.done).length}`);

// ── 5. готовность черновика видна в списке
await p.locator('.chk-row', { hasText: 'Как я веду систему' }).locator('.pill').click(); await p.waitForTimeout(500);
ok('черновик показывает готовность структуры', /17%/.test(await p.locator('.card', { hasText: 'Черновики' }).innerText()),
  await p.locator('.card', { hasText: 'Черновики' }).innerText());

// ── 6. раскладка по рубрикам и форматам после публикации
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const post2 = s.blog.posts.find(x => x.title === 'Как я веду систему');
  post2.stage = 'out'; post2.day = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700); await open();
t = await scr();
ok('рубрикатор показывает долю', /Система[\s\S]{0,30}1 · 100%/.test(t), (t.match(/Система.{0,40}/) || [''])[0]);
ok('пустая рубрика названа честно', /Быт[\s\S]{0,30}ещё не выходило/.test(t));
ok('доли названы не нормой', /а не норма/.test(t));
ok('формат посчитан за месяц', /Рилс · 1/.test(t), (t.match(/ФОРМАТЫ[\s\S]{0,60}/) || [''])[0]);

// пост без рубрики считается отдельно, а не приписывается к чужой
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.blog.posts.push({ id: 'nr', title: 'Без рубрики', place: 'both', stage: 'out',
    day: new Date().toISOString().slice(0, 10), format: '', rubrics: [], blocks: [], seed: '', link: '', views: null, note: '', movedAt: '' });
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700); await open();
ok('пост без рубрики учтён отдельно', /Без рубрики: 1/.test(await scr()));

// ── 7. удаление рубрики снимает её с постов
await p.locator('[data-act="rubrics"]').click(); await p.waitForTimeout(400);
await p.locator('.sheet .link-row', { hasText: 'Система' }).locator('[data-act="ls-del"]').click(); await p.waitForTimeout(450);
await p.locator('[data-sheet="danger"], .sheet button:has-text("Убрать")').first().click(); await p.waitForTimeout(600);
bl = await blog();
ok('рубрика удалена', !bl.rubrics.some(r => r.name === 'Система'), bl.rubrics.map(r => r.name).join(', '));
ok('и снята с поста, а сам пост цел', bl.posts.find(x => x.title === 'Как я веду систему')?.rubrics.length === 0
  && bl.posts.some(x => x.title === 'Как я веду систему'));

// ── 8. перенос старых меток в рубрикатор
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.v = 40;
  s.blog.rubrics = [];
  s.blog.posts = [
    { id: 'a', title: 'Раз', place: 'both', stage: 'out', day: '2026-07-01', link: '', views: null, tags: ['Еда', 'Быт'], note: '', movedAt: '' },
    { id: 'b', title: 'Два', place: 'ig', stage: 'idea', day: '', link: '', views: null, tags: ['еда'], note: '', movedAt: '' },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
bl = await blog();
ok('метки стали рубриками', bl.rubrics.length === 2, bl.rubrics.map(r => r.name).join(', '));
ok('«Еда» и «еда» склеились в одну', bl.rubrics.filter(r => /еда/i.test(r.name)).length === 1);
const eda = bl.rubrics.find(r => /еда/i.test(r.name)).id;
ok('обе записи ссылаются на неё', bl.posts.every(x => x.rubrics.includes(eda)));
ok('вторая метка первого поста не потерялась', bl.posts[0].rubrics.length === 2);
ok('старое поле меток убрано', bl.posts.every(x => x.tags === undefined));

await open();
await p.screenshot({ path: 'blogtools.png', fullPage: true });
console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
