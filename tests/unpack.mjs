// Распаковка как тест: двенадцать вопросов о том, из чего у человека выходит
// контент, и портрет автора — на чём стоит, как звучит, в какой форме легче.
// Раньше это была карусель вопросов: она подсказывала темы, но не отвечала на
// вопрос «а кто я как автор и что мне с этим делать».
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
// Летописец отвечает списком идей — подменяем ответ, чтобы не ходить наружу.
await ctx.route(/api\.openai\.com/, r => r.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ choices: [{ message: { content:
    'Как я считала бюджет РК и ошиблась на 200 тысяч\nЧто я поняла за год ведения кампаний\n'
    + 'Три отчёта, которые никто не читает\nПочему медиаплан врёт\n'
    + 'Мой порядок действий, когда всё горит\nКак объяснить клиенту, что так не сработает' } }] }),
}));
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const scr = () => p.locator('#scr').innerText();

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  localStorage.setItem('lifeos.openai.key', 'sk-test-0123456789012345678901234567890');
  location.hash = '#/spheres/blog';
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.waitForTimeout(500);

// ── до теста: приглашение и вопрос дня ──────────────────────────
let t = await scr();
ok('распаковка зовёт пройти тест', /Пройти распаковку/.test(t));
ok('и объясняет, о чём он', /из чего у тебя получается контент/.test(t));
ok('банк вопросов никуда не делся', /вопрос дня/i.test(t) && /все \d+/.test(t));

// ── проходим тест: везде выбираем первый вариант ────────────────
await p.locator('[data-act="unpackstart"]').click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('тест начался с первого вопроса', /вопрос 1 из 12/.test(sheet), sheet.split('\n')[1]);
ok('и сказано, что правильных ответов нет', /правильных ответов нет/.test(sheet));
ok('на первом шаге назад некуда', await p.locator('.sheet [data-act="uback"]').count() === 0);

await p.locator('.sheet [data-act="upick"]').first().click(); await p.waitForTimeout(350);
sheet = await p.locator('.sheet').innerText();
ok('перешли ко второму', /вопрос 2 из 12/.test(sheet));
ok('и теперь можно вернуться', await p.locator('.sheet [data-act="uback"]').count() === 1);
await p.locator('.sheet [data-act="uback"]').click(); await p.waitForTimeout(350);
ok('назад возвращает к первому', /вопрос 1 из 12/.test(await p.locator('.sheet').innerText()));
ok('и на середине ничего не записано', (await st()).blog.unpack === null,
  JSON.stringify((await st()).blog.unpack));

for (let i = 0; i < 12; i++) {
  await p.locator('.sheet [data-act="upick"]').first().click();
  await p.waitForTimeout(280);
}
await p.waitForTimeout(400);
const saved = (await st()).blog.unpack;
ok('ответы записались все двенадцать', saved && saved.picks.length === 12, JSON.stringify(saved?.picks));
ok('и с датой', !!saved?.at, saved?.at);
ok('итог отдельно не хранится', saved && !('well' in saved), Object.keys(saved || {}).join(', '));

// ── портрет на экране ───────────────────────────────────────────
t = await scr();
ok('показан портрет автора', /Опыт\./.test(t) && /голос/.test(t), t.match(/Опыт[^\n]*/)?.[0]);
ok('названы рубрики отсюда', /Твои рубрики отсюда/.test(t));
ok('и форма', /Формы:/.test(t));
ok('слабая сторона названа честно, а не запретом',
  /Дороже всего даётся/.test(t) && /стоить сил/.test(t), t.match(/Дороже[^\n]*/)?.[0]);

// ── рубрики заводятся по тапу, а не сами ────────────────────────
ok('сами рубрики не завелись', (await st()).blog.rubrics.length === 0, String((await st()).blog.rubrics.length));
await p.locator('[data-act="unpackrubrics"]').click(); await p.waitForTimeout(500);
ok('спросили перед тем, как заводить', /Завести рубрики/.test(await p.locator('.sheet').innerText()));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
const rubs = (await st()).blog.rubrics;
ok('рубрики появились', rubs.length === 3, rubs.map(x => x.name).join(', '));
ok('и подписаны, откуда они', rubs.every(x => x.note === 'из распаковки'));
await p.locator('[data-act="unpackrubrics"]').click(); await p.waitForTimeout(500);
ok('второй раз те же не задваиваются', (await st()).blog.rubrics.length === 3);

// ── идеи от Летописца ───────────────────────────────────────────
await p.locator('[data-act="unpackideas"]').click(); await p.waitForTimeout(1200);
sheet = await p.locator('.sheet').innerText();
ok('Летописец принёс идеи', /Как я считала бюджет РК/.test(sheet), sheet.split('\n').slice(0, 4).join(' · '));
ok('их шесть', await p.locator('.sheet [data-act="ideatake"]').count() === 6,
  String(await p.locator('.sheet [data-act="ideatake"]').count()));
ok('и сказано, что сами они в банк не идут', /только та, что возьмёшь/.test(sheet));
ok('в банке пока пусто', (await st()).blog.posts.length === 0);
await p.locator('.sheet [data-act="ideatake"]').first().click(); await p.waitForTimeout(600);
const posts = (await st()).blog.posts;
ok('взятая идея легла в банк', posts.length === 1 && /бюджет РК/.test(posts[0].title), posts[0]?.title);
ok('идеей, а не постом', posts[0]?.stage === 'idea', posts[0]?.stage);
ok('и помнит, откуда взялась', posts[0]?.seed === 'распаковка', posts[0]?.seed);

// ── пройти заново можно ─────────────────────────────────────────
await p.locator('[data-act="unpackstart"]').click(); await p.waitForTimeout(500);
ok('заново начинается с первого вопроса', /вопрос 1 из 12/.test(await p.locator('.sheet').innerText()));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('а брошенный на середине не стёр прежний портрет', (await st()).blog.unpack.picks.length === 12);

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ распаковка распаковывает');
process.exit(bad ? 1 : 0);
