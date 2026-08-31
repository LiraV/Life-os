// «Моё дело» — это не только приложения: клуб, студорганизация, товары,
// продажи через себя. Вид дела ничего не считает и ничего не ограничивает —
// он выбирает подсказки: у клуба и у приложения запуск устроен по-разному.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);

// ── старые виды переезжают в ключи, чужое — в «Другое» ──────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.v = 52;
  s.biz.projects = [
    { id: 'p1', name: 'Планер', kind: 'Приложение', stage: 'live', launched: '2026-05-01', steps: [], metrics: [], marks: [] },
    { id: 'p2', name: 'Лавка', kind: 'Другое', stage: 'build', steps: [], metrics: [], marks: [] },
    { id: 'p3', name: 'Клуб', kind: 'Чепуха из будущего', stage: 'idea', steps: [], metrics: [], marks: [] },
    { id: 'p4', name: 'Без вида', kind: '', stage: 'idea', steps: [], metrics: [], marks: [] },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
// Запись отложена на 120 мс — читаем хранилище, а не только память: перевод
// должен закрепиться на диске, иначе он будет делаться заново при каждом входе.
await p.waitForTimeout(600);
const kinds = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).biz.projects.map(x => [x.name, x.kind]));
ok('«Приложение» стало цифровым продуктом', kinds[0][1] === 'product', kinds[0].join('='));
ok('«Другое» осталось «Другим»', kinds[1][1] === 'other', kinds[1].join('='));
ok('неизвестный вид ушёл в «Другое»', kinds[2][1] === 'other', kinds[2].join('='));
ok('пустой вид остался пустым', kinds[3][1] === '', `«${kinds[3][1]}»`);

// ── виды покрывают не только цифровое ───────────────────────────
const model = await p.evaluate(async () => {
  const m = await import('/app/js/biz.js');
  return {
    names: m.BIZ_KINDS.map(k => k.name),
    club: m.bizStepHints('community'),
    app: m.bizStepHints('product'),
    clubM: m.bizMetricHints('community').map(x => x.name),
    none: m.bizStepHints('').length,
    other: m.bizStepHints('other').length,
    dup: m.BIZ_KINDS.some(k => new Set(m.bizStepHints(k.key)).size !== m.bizStepHints(k.key).length
      || new Set(m.bizMetricHints(k.key).map(x => x.name)).size !== m.bizMetricHints(k.key).length),
    keys: new Set(m.BIZ_KINDS.map(k => k.key)).size === m.BIZ_KINDS.length,
    named: m.kindName('org'),
  };
});
for (const want of ['Цифровой продукт', 'Товары', 'Услуги и практика', 'Комьюнити', 'Организация', 'Личный бренд', 'Мероприятие', 'Другое'])
  ok(`есть вид «${want}»`, model.names.includes(want));
ok('ключи видов не повторяются', model.keys);
ok('у клуба свои шаги, не про домен', model.club.some(s => /встречу/i.test(s)) && !model.club.some(s => /домен|ссылк/i.test(s)),
  model.club[0]);
ok('у продукта — свои', model.app.some(s => /домен/i.test(s)), model.app[1]);
ok('у клуба показатели про людей', model.clubM.includes('Участники') && !model.clubM.includes('Установки'), model.clubM.join(', '));
ok('без вида остаются общие шаги', model.none === 5, String(model.none));
ok('у «Другого» тоже общие', model.other === 5, String(model.other));
ok('подсказки не дублируются', !model.dup);
ok('вид зовётся по-человечески', model.named === 'Организация', model.named);

// ── экран показывает название вида, а не ключ ───────────────────
await p.evaluate(() => { location.hash = '#/biz'; }); await p.waitForTimeout(700);
let txt = await p.locator('#scr').innerText();
ok('в списке — «Цифровой продукт», а не «product»', /Цифровой продукт/i.test(txt) && !/\bproduct\b/.test(txt));

await p.evaluate(() => { location.hash = '#/biz/p3'; }); await p.waitForTimeout(600);
await p.click('[data-act="steps"]'); await p.waitForTimeout(500);
txt = await p.locator('.sheet').innerText();
ok('шаги предлагаются по виду дела', /Все подсказки уже взяты|Описать в двух предложениях/i.test(txt));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);

// Меняем вид на комьюнити — подсказки должны стать другими.
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.biz.projects.find(x => x.id === 'p3').kind = 'community';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.evaluate(() => { location.hash = '#/biz/p3'; }); await p.waitForTimeout(600);
await p.click('[data-act="steps"]'); await p.waitForTimeout(500);
txt = await p.locator('.sheet').innerText();
ok('у клуба в шагах — первая встреча', /первую встречу/i.test(txt), txt.split('\n').slice(1, 3).join(' / '));
ok('и никакого домена', !/домен/i.test(txt));
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.click('[data-act="metrics"]'); await p.waitForTimeout(500);
txt = await p.locator('.sheet').innerText();
ok('и показатели про участников', /Участники/i.test(txt) && !/Установки/i.test(txt));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// ── Летописец знает, что это за дело ────────────────────────────
const d = await p.evaluate(async () => (await import('/app/js/selectors.js')).chatDigest());
ok('в выжимке виден вид дела', /Клуб \(комьюнити\)/.test(d), (d.match(/Моё дело:.{0,70}/) || [''])[0]);

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ дело может быть каким угодно');
process.exit(bad ? 1 : 0);
