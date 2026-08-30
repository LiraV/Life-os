// Свои мерки тела: подсказки, добавление, запись и удаление без потери чисел.
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
// Замеры живут на вкладке «Сейчас» — она открыта по умолчанию.
// «Форма» — это про связки за период, там их только показывают.
const form = async () => { await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(650); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await form();

// ── 1. по умолчанию только опорные три
await p.locator('[data-act="measure"]').click(); await p.waitForTimeout(500);
let fields = await p.locator('.sheet input[type=number]').evaluateAll(els => els.map(e => e.name));
ok('в форме три опорные мерки', fields.join(',') === 'weight,waist,hips', fields.join(','));
ok('сказано, почему вес и талия всегда есть', /нужны формулам/.test(await p.locator('.sheet').innerText()));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 2. свои мерки: подсказки, но ничего не навязано
await p.locator('[data-act="metrics"]').click(); await p.waitForTimeout(500);
let sheet = await p.locator('.sheet').innerText();
ok('пока ничего своего нет', /Пока ничего своего/.test(sheet));
ok('есть подсказки', await p.locator('.sheet [data-act="mtadd"]').count() === 8,
  String(await p.locator('.sheet [data-act="mtadd"]').count()));
ok('подсказки не записались сами', ((await st()).health.metrics || []).length === 0);

await p.locator('.sheet [data-act="mtadd"][data-n="Грудь"]').click(); await p.waitForTimeout(500);
await p.locator('.sheet [data-act="mtadd"][data-n="Жир"]').click(); await p.waitForTimeout(500);
let s = await st();
ok('две мерки завелись', s.health.metrics.length === 2, JSON.stringify(s.health.metrics.map(x => x.name + '/' + x.unit)));
ok('у жира единица — проценты', s.health.metrics.find(x => x.name === 'Жир')?.unit === '%');
ok('взятая подсказка из списка ушла', await p.locator('.sheet [data-act="mtadd"][data-n="Грудь"]').count() === 0);

await p.fill('.sheet [data-field="mtnew"]', 'Запястье');
await p.locator('.sheet [data-act="mtown"]').click(); await p.waitForTimeout(500);
ok('своя мерка добавилась', (await st()).health.metrics.length === 3);
await p.fill('.sheet [data-field="mtnew"]', 'грудь');
await p.locator('.sheet [data-act="mtown"]').click(); await p.waitForTimeout(500);
ok('тёзка не заводится', (await st()).health.metrics.length === 3, String((await st()).health.metrics.length));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 3. форма замера выросла
await p.locator('[data-act="measure"]').click(); await p.waitForTimeout(500);
fields = await p.locator('.sheet input[type=number]').evaluateAll(els => els.map(e => e.name));
ok('в форме теперь шесть мерок', fields.length === 6, String(fields.length));
const ids = (await st()).health.metrics;
await p.fill('.sheet input[name="weight"]', '67');
await p.fill(`.sheet input[name="${ids.find(x => x.name === 'Грудь').id}"]`, '88');
await p.fill(`.sheet input[name="${ids.find(x => x.name === 'Жир').id}"]`, '24');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
s = await st();
const rec = s.health.measures[0];
ok('опорное поле легло полем', rec.weight === 67, JSON.stringify(rec.weight));
ok('свои — в extra по id', Object.keys(rec.extra).length === 2, JSON.stringify(rec.extra));
ok('незаполненное не записалось нулём', rec.waist === null && rec.extra[ids.find(x => x.name === 'Запястье').id] === undefined,
  JSON.stringify({ waist: rec.waist, extra: rec.extra }));

// ── 4. карточка показывает все мерки и разницу
let scr = await p.locator('.scr').innerText();
ok('в карточке видно грудь', /Грудь/.test(scr) && /88/.test(scr));
ok('и жир в процентах', /24 %/.test(scr), (scr.match(/Жир.{0,12}/) || [''])[0]);
await p.locator('[data-act="measure"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet input[name="weight"]', '66');
await p.fill(`.sheet input[name="${ids.find(x => x.name === 'Грудь').id}"]`, '86');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
scr = await p.locator('.scr').innerText();
ok('разница считается и по своим меркам', /−2/.test(scr) || /-2/.test(scr), (scr.match(/Грудь.{0,16}/) || [''])[0]);
ok('в истории перечислены обе записи', (await st()).health.measures.length === 2);

// ── 5. удаление мерки не трогает записанные числа
await p.locator('[data-act="metrics"]').click(); await p.waitForTimeout(500);
await p.locator('.sheet .link-row', { hasText: 'Грудь' }).locator('[data-act="mtdel"]').click(); await p.waitForTimeout(600);
s = await st();
ok('мерка удалена', !s.health.metrics.some(x => x.name === 'Грудь'), s.health.metrics.map(x => x.name).join(', '));
ok('числа в прошлых замерах остались', s.health.measures.every(r2 => ids.find(x => x.name === 'Грудь').id in r2.extra),
  JSON.stringify(s.health.measures.map(r2 => r2.extra)));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.locator('[data-act="measure"]').click(); await p.waitForTimeout(500);
fields = await p.locator('.sheet input[type=number]').evaluateAll(els => els.map(e => e.name));
ok('из формы она исчезла', fields.length === 5, String(fields.length));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// ── 6. формулы по-прежнему берут вес и талию
const calc = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const { update } = await import('./app/js/store.js');
  update(s2 => { s2.user.height = 170; s2.user.birth = '1996-01-01'; s2.health.measures[1].waist = 74; });
  return { bmi: m.bmi()?.value, waist: m.waistRisk()?.cm, en: !!m.energyNeed() };
});
ok('ИМТ считается от веса', calc.bmi === 22.8, String(calc.bmi));
ok('порог талии видит талию', calc.waist === 74, String(calc.waist));
ok('суточный расход на месте', calc.en);

// ── 7. старые замеры без extra живы
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 44, onboarded: true,
    user: { name: 'Старая', chronotype: 'сова' },
    health: { days: {}, symptoms: [], measures: [{ id: 'm1', date: '2026-07-01', weight: 60, waist: 70, hips: 95 }] } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('старому замеру добавился пустой extra', JSON.stringify(s.health.measures[0].extra) === '{}', JSON.stringify(s.health.measures[0]));
ok('и его числа целы', s.health.measures[0].weight === 60 && s.health.measures[0].hips === 95);
ok('мерок по умолчанию не выдумали', (s.health.metrics || []).length === 0);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
