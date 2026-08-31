// Сфера «Моё дело»: проекты по стадиям, шаги до запуска, свои показатели.
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
const scr = () => p.locator('.scr').innerText();
const biz = async () => { await p.evaluate(() => { location.hash = '#/biz'; }); await p.waitForTimeout(650); };
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
ok('плитка «Моё дело» есть', await p.locator('.tile', { hasText: 'Моё дело' }).count() === 1);
await p.locator('.tile', { hasText: 'Моё дело' }).click(); await p.waitForTimeout(700);
ok('открывается свой экран', await p.evaluate(() => location.hash) === '#/biz');
let t = await scr();
ok('идея названа делом', /Идея — тоже дело/.test(t));
ok('заморозку на пустой сфере не рисуем', !/Заморожено/.test(t));

// ── 2. проект от идеи до запуска
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="name"]', 'Life OS');
await p.locator('.sheet .opts[data-name="kind"] .opt', { hasText: 'Цифровой продукт' }).click(); await p.waitForTimeout(200);
await p.fill('.sheet input[name="link"]', 'https://lirav.github.io/Life-os/');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
let pr = s.biz.projects[0];
ok('проект завёлся идеей', pr.stage === 'idea' && pr.kind === 'product', JSON.stringify({ st: pr.stage, k: pr.kind }));
ok('дня запуска нет', pr.launched === '', JSON.stringify(pr.launched));
ok('тёзка не заводится', await p.evaluate(async () => {
  const { S } = await import('./app/js/store.js');
  const { nameTaken } = await import('./app/js/store.js');
  return !!nameTaken(S.biz.projects, 'life os');
}));

const pill = () => p.locator('.chk-row', { hasText: 'Life OS' }).locator('.pill').first();
await pill().click(); await p.waitForTimeout(400);
ok('стадия «делаю»', (await st()).biz.projects[0].stage === 'build');
await pill().click(); await p.waitForTimeout(500);
s = await st(); pr = s.biz.projects[0];
ok('стадия «запущено»', pr.stage === 'live');
ok('день запуска проставился сегодняшним', pr.launched === today, pr.launched);
ok('запуск попал в дневник', s.diary.some(d => /запущено: Life OS/.test(d.text)));
ok('в подзаголовке видно живой проект', /1 проект живёт/.test(await scr()), (await scr()).split('\n')[2]);

// ── 3. свой экран проекта
await p.locator('.chk-row', { hasText: 'Life OS' }).locator('.grow').click(); await p.waitForTimeout(650);
ok('открылся экран проекта', /#\/biz\//.test(await p.evaluate(() => location.hash)), await p.evaluate(() => location.hash));
t = await scr();
ok('видно, что это и когда запущено', /Цифровой продукт/i.test(t) && /запущено/.test(t));
ok('ссылка показана', /lirav\.github\.io/.test(t));

// ── 4. шаги до запуска
await p.locator('[data-act="steps"]').click(); await p.waitForTimeout(500);
ok('десять подсказок шагов: пять своих и пять общих', await p.locator('.sheet [data-act="stepadd"]').count() === 10,
  String(await p.locator('.sheet [data-act="stepadd"]').count()));
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(600);
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(600);
ok('два шага взялись', (await st()).biz.projects[0].steps.length === 2);
// шторка остаётся открытой: шаги берут подряд
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator('[data-act="steptick"]').first().click(); await p.waitForTimeout(500);
ok('шаг отмечается', (await st()).biz.projects[0].steps[0].done === true);
ok('прогресс шагов виден', /50%/.test(await scr()), (await scr()).match(/Шаги[\s\S]{0,24}/)?.[0]?.replace(/\n/g, ' · '));

// ── 5. показатели и отметки
await p.locator('[data-act="metrics"]').click(); await p.waitForTimeout(500);
// Подсказки показателей — свои для вида дела плюс общие: у цифрового
// продукта это четыре и три. Порядок важен: своё вперёд.
const hints = await p.locator('.sheet [data-act="madd"]').allTextContents();
ok('подсказки показателей — свои для вида плюс общие', hints.length === 7, hints.join(', '));
ok('свои идут первыми', /Пользователи/.test(hints[0]) && /Отзывы/.test(hints[6]), `${hints[0]} … ${hints[6]}`);
await p.locator('.sheet [data-act="madd"][data-n="Пользователи"]').click(); await p.waitForTimeout(600);
await p.fill('.sheet [data-field="mname"]', 'Открытий в день');
await p.fill('.sheet [data-field="munit"]', 'раз');
await p.locator('.sheet [data-act="mown"]').click(); await p.waitForTimeout(600);
s = await st();
ok('два показателя со своими единицами', s.biz.projects[0].metrics.length === 2
  && s.biz.projects[0].metrics[1].unit === 'раз', JSON.stringify(s.biz.projects[0].metrics));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

t = await scr();
ok('показатель без отметок так и подписан', /ещё не отмечали/.test(t));
await p.locator('[data-act="mark"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="value"]', '12');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('отметка записалась', s.biz.projects[0].marks.length === 1 && s.biz.projects[0].marks[0].value === 12,
  JSON.stringify(s.biz.projects[0].marks));
ok('и видна в списке', /12 чел/.test(await scr()), (await scr()).match(/Пользователи.{0,24}/)?.[0]);

// вторая отметка показывает сдвиг, а тот же день переписывается
await p.locator('[data-act="mark"]').first().click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="value"]', '20');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
ok('за тот же день значение переписалось, а не удвоилось', s.biz.projects[0].marks.length === 1
  && s.biz.projects[0].marks[0].value === 20, JSON.stringify(s.biz.projects[0].marks));

await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  const pr2 = x.biz.projects[0];
  pr2.marks.unshift({ id: 'old', metricId: pr2.metrics[0].id, date: '2026-08-01', value: 5 });
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
ok('сдвиг от прошлой отметки показан', /\+15/.test(await scr()), (await scr()).match(/Пользователи.{0,30}/)?.[0]);

// ── 6. цели отсюда
const calc = await p.evaluate(async y => {
  const m = await import('./app/js/selectors.js');
  const { S } = await import('./app/js/store.js');
  const pr2 = S.biz.projects[0];
  // У показателя теперь своё имя: имя проекта впереди не нужно.
  const ref = pr2.metrics[0].id;
  return {
    srcs: m.sourcesOf('biz').map(x => x.key),
    launched: m.SOURCES.bizLaunched.count('', { from: `${y}-01-01`, to: `${y}-12-31` }),
    best: m.SOURCES.bizMetric.count(ref),
    unit: m.SOURCES.bizMetric.unitOf(ref),
    label: m.SOURCES.bizMetric.refName(ref),
  };
}, today.slice(0, 4));
console.log(' ', JSON.stringify(calc));
ok('в сфере два счёта', calc.srcs.join(',') === 'bizLaunched,bizMetric', calc.srcs.join(','));
ok('запущенных за год — один', calc.launched === 1, String(calc.launched));
ok('лучший показатель — 20', calc.best === 20, String(calc.best));
ok('единица берётся у показателя', calc.unit === 'чел', calc.unit);
ok('в подписи и проект, и показатель', /Life OS · Пользователи/.test(calc.label), calc.label);

// ── 7. роль и старые данные
const role = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.roles().find(r => r.name === 'Артистка')?.parts?.map(x => x.label) || null;
});
ok('роль «Артистка» видит запуски и отметки', role && role.includes('запуски'), JSON.stringify(role));
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 46, onboarded: true, user: { name: 'Старая', chronotype: 'сова' } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('старым данным сфера добавилась пустой', JSON.stringify(s.biz) === '{"projects":[]}', JSON.stringify(s.biz));
ok('роль сферы проставилась', s.roleOf.biz === 'artist', s.roleOf.biz);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
