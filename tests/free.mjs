// Сфера «Фриланс»: заказы, деньги по дню оплаты, площадки, услуги, шаги.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const free = async () => { await p.evaluate(() => { location.hash = '#/free'; }); await p.waitForTimeout(650); };
const scr = () => p.locator('.scr').innerText();
const today = new Date().toISOString().slice(0, 10);

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. плитка и пустая сфера
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(650);
ok('плитка «Фриланс» есть', await p.locator('.tile', { hasText: 'Фриланс' }).count() === 1);
await p.locator('.tile', { hasText: 'Фриланс' }).click(); await p.waitForTimeout(700);
ok('открывается свой экран', await p.evaluate(() => location.hash) === '#/free');
let t = await scr();
ok('деньги считаются по дню оплаты', /Считается по дню оплаты/.test(t));
ok('пустой месяц без упрёка', /не упрёк/.test(t));
ok('площадок и услуг нет, но сказано зачем они', /Кворк/.test(t) && /Лендинг|не считать её заново/.test(t));
ok('оплаченных и сорванных карточек не рисуем на пустой сфере', !/СОРВАЛСЯ/i.test(t));

// ── 2. площадки
await p.locator('[data-act="places"]').click(); await p.waitForTimeout(500);
ok('есть подсказки площадок', await p.locator('.sheet [data-act="ls-sg"]').count() === 5,
  String(await p.locator('.sheet [data-act="ls-sg"]').count()));
await p.locator('.sheet [data-act="ls-sg"][data-n="Кворк"]').click(); await p.waitForTimeout(500);
let s = await st();
ok('Кворк добавился с комиссией 20', s.free.places[0]?.name === 'Кворк' && s.free.places[0]?.fee === 20,
  JSON.stringify(s.free.places[0]));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 3. услуга заводит заказ
await free();
await p.locator('[data-act="services"]').click(); await p.waitForTimeout(500);
await p.locator('.sheet [data-act="ls-sg"][data-n="Лендинг"]').click(); await p.waitForTimeout(500);
ok('услуга добавилась с ценой', (await st()).free.services[0]?.price === 25000, JSON.stringify((await st()).free.services[0]));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await free();
await p.locator('[data-act="fromservice"]').first().click(); await p.waitForTimeout(500);
ok('шторка заказа заполнена из услуги', await p.inputValue('.sheet input[name="title"]') === 'Лендинг'
  && await p.inputValue('.sheet input[name="price"]') === '25000',
  await p.inputValue('.sheet input[name="title"]'));
const kworkId = (await st()).free.places.find(x => x.name === 'Кворк').id;
await p.selectOption('.sheet select[name="placeId"]', kworkId).catch(() => {});
await p.locator('.sheet .opts[data-name="kind"] .opt', { hasText: 'Вёрстка' }).click(); await p.waitForTimeout(200);
await p.fill('.sheet input[name="fee"]', '20');
await p.fill('.sheet input[name="due"]', today);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
let o = s.free.orders[0];
ok('заказ завёлся в «обсуждаем»', o.stage === 'talk' && o.price === 25000, JSON.stringify({ st: o.stage, pr: o.price }));
ok('дня оплаты у него нет', o.paidAt === '', JSON.stringify(o.paidAt));
ok('в деньгах он не считается', /0 ₽/.test(await scr()) || !/25 000/.test((await scr()).split('Обсуждаем')[0]),
  (await scr()).split('\n').slice(3, 6).join(' · '));
ok('срок показан отдельно', /СРОКИ/i.test(await scr()));

// ── 4. движение по стадиям до денег
const pill = () => p.locator('.chk-row', { hasText: 'Лендинг' }).locator('.pill').first();
for (let i = 0; i < 4; i++) { await pill().click(); await p.waitForTimeout(400); }
s = await st(); o = s.free.orders[0];
ok('дошёл до «оплачен»', o.stage === 'paid', o.stage);
ok('день оплаты проставился сегодняшним', o.paidAt === today, o.paidAt);
ok('оплата попала в дневник', s.diary.some(d => /оплачен заказ/.test(d.text)));
const norm = x => x.replace(/\u00a0/g, ' ');
t = norm(await scr());
ok('деньги месяца выросли', /25 000 ₽/.test(t), (t.match(/.{0,20}25 000.{0,24}/) || [''])[0]);
ok('чистыми — минус комиссия', /чистыми 20 000 ₽/.test(t), (t.match(/чистыми.{0,14}/) || [''])[0]);
ok('средний чек показан', /средний чек 25 000/.test(t));
ok('площадка показывает свой итог', /Кворк[\s\S]{0,40}25 000/.test(t), (t.match(/Кворк.{0,40}/) || [''])[0]);

// ── 5. счёт напрямую
const calc = await p.evaluate(async ([ym, y, kw]) => {
  const m = await import('./app/js/selectors.js');
  return {
    gross: m.freeGross(`${ym}-01`, `${ym}-31`), net: m.freeNet(`${ym}-01`, `${ym}-31`),
    kwork: m.freeGross(`${y}-01-01`, `${y}-12-31`, kw), other: m.freeGross(`${y}-01-01`, `${y}-12-31`, 'нет-такой'),
    srcs: m.sourcesOf('free').map(x => x.key),
  };
}, [today.slice(0, 7), today.slice(0, 4), kworkId]);
ok('грязными 25000, чистыми 20000', calc.gross === 25000 && calc.net === 20000, JSON.stringify(calc));
ok('по площадке считается своё', calc.kwork === 25000 && calc.other === 0);
ok('в сфере три счёта для целей', ['freeOrders', 'freeMoney', 'freeNet'].every(k => calc.srcs.includes(k)), calc.srcs.join(', '));

// ── 6. сорвавшийся заказ считается честно
await p.evaluate(d => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.free.orders.push({ id: 'o2', title: 'Правки', place: 'Кворк', kind: 'Правки', price: 3000, fee: 20,
    stage: 'lost', due: '', paidAt: '', link: '', note: '', movedAt: d });
  localStorage.setItem('lifeos.state', JSON.stringify(x));
}, today);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800); await free();
t = norm(await scr());
ok('сорвавшийся виден отдельной карточкой', /Сорвался/i.test(t));
ok('и в воронке', /ВОРОНКА/i.test(t) && /Сорвался · 1/.test(t), (t.match(/ВОРОНКА[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' · '));
ok('но в деньги не попал', (await p.evaluate(async ym => (await import('./app/js/selectors.js')).freeGross(`${ym}-01`, `${ym}-31`), today.slice(0, 7))) === 25000);

// ── 7. путь на фриланс
await p.locator('[data-act="steps"]').click(); await p.waitForTimeout(500);
ok('десять подсказок шагов', await p.locator('.sheet [data-act="stepadd"]').count() === 10,
  String(await p.locator('.sheet [data-act="stepadd"]').count()));
ok('сказано, что сами не появятся', /не появится сам/.test(await p.locator('.sheet').innerText()));
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(600);
ok('шаг взялся', (await st()).free.steps.length === 1, JSON.stringify((await st()).free.steps));
// шторка теперь остаётся открытой — закрываем её сами
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator('[data-act="steptick"]').first().click(); await p.waitForTimeout(500);
ok('шаг отмечается', (await st()).free.steps[0].done === true);
ok('счётчик шагов виден', /1 из 1/.test(await scr()));

// ── 8. роль и старые данные
const role = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.roles().find(r => r.name === 'Мастерица')?.n ?? null;
});
ok('роль «Мастерица» видит оплаченный заказ', role >= 1, String(role));
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 45, onboarded: true, user: { name: 'Старая', chronotype: 'сова' } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('старым данным сфера добавилась пустой', JSON.stringify(s.free) === '{"orders":[],"places":[],"services":[],"steps":[]}',
  JSON.stringify(s.free));
ok('роль сферы проставилась', s.roleOf.free === 'master', s.roleOf.free);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
