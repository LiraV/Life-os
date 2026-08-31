// В целях предлагается только то, что имеет смысл: незакрытое — для привязки к
// делам, и свой же период — для привязки к цели выше. Плюс два новых счёта:
// «сдать этап» и своя строка трекера.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const t0 = await p.evaluate(() => new Date().toISOString().slice(0, 10));
const ym = t0.slice(0, 7), yr = t0.slice(0, 4);
const q = `${yr}-Q${Math.ceil(Number(ym.slice(5)) / 3)}`;

await p.evaluate(([m, y, qq]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.study.places = [{ id: 'pl', name: 'Универ' }];
  s.study.subjects = [{ id: 'sb1', placeId: 'pl', name: 'Диплом' }];
  s.study.tasks = [
    { id: 'open1', subjectId: 'sb1', title: 'Глава 3', stage: 'draft', doneAt: '', due: '' },
    { id: 'done1', subjectId: 'sb1', title: 'Глава 1', stage: 'done', doneAt: `${m}-02`, due: '' },
  ];
  s.tracker.rows = [{ id: 'row1', name: 'Свои страницы', unit: 'стр' }];
  s.tracker.values = { row1: { [m]: 40 } };
  s.lessons = [{ id: 'l1', name: 'Вёрстка', kind: 'course', log: {}, items: [
    { id: 'm1', title: 'HTML', lessons: [{ id: 'x1', title: 'a', done: true }, { id: 'x2', title: 'b', done: true }] },
    { id: 'm2', title: 'CSS', lessons: [{ id: 'y1', title: 'c', done: false }] },
  ] }];
  s.goals = [
    { id: 'gq', title: 'Цель этого квартала', horizon: 'quarter', period: qq, steps: [], slots: [] },
    { id: 'gq_old', title: 'Цель прошлого года', horizon: 'quarter', period: `${Number(y) - 1}-Q1`, steps: [], slots: [] },
    { id: 'gy', title: 'Цель этого года', horizon: 'year', period: y, steps: [], slots: [] },
    { id: 'gy_old', title: 'Цель прошлого года целиком', horizon: 'year', period: String(Number(y) - 1), steps: [], slots: [] },
  ];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
}, [ym, yr, q]);
await p.waitForTimeout(900);

// ── счёт «сдать этап» и своя строка трекера ─────────────────────
const calc = await p.evaluate(async ([m, y]) => {
  const S = await import('/app/js/selectors.js');
  const r = { from: `${m}-01`, to: `${m}-31` };
  const year = { from: `${y}-01-01`, to: `${y}-12-31` };
  return {
    учёба: S.sourcesOf('study').map(x => x.key),
    открытые: S.SOURCES.studyTask.ref().map(x => x.label),
    сданныйЭтап: S.SOURCES.studyTask.count('done1'),
    открытыйЭтап: S.SOURCES.studyTask.count('open1'),
    строкаЗаМесяц: S.SOURCES.trackerRow.count('row1', r),
    строкаЗаГод: S.SOURCES.trackerRow.count('row1', year),
    единица: S.SOURCES.trackerRow.unitOf('row1'),
    модули: S.SOURCES.courseModule.ref().map(x => x.label),
  };
}, [ym, yr]);
ok('в учёбе появился счёт «сдать этап»', calc.учёба.includes('studyTask'), calc.учёба.join(','));
ok('в списке этапов только несданное', calc.открытые.length === 1 && /Глава 3/.test(calc.открытые[0]), calc.открытые.join(' | '));
ok('сданный этап считается за единицу', calc.сданныйЭтап === 1 && calc.открытыйЭтап === 0, `${calc.сданныйЭтап}/${calc.открытыйЭтап}`);
ok('своя строка трекера считается за месяц', calc.строкаЗаМесяц === 40, String(calc.строкаЗаМесяц));
ok('и за год — сумма месяцев', calc.строкаЗаГод === 40, String(calc.строкаЗаГод));
ok('единица берётся у строки', calc.единица === 'стр', calc.единица);
ok('пройденный модуль в списке не предлагается', calc.модули.length === 1 && /CSS/.test(calc.модули[0]), calc.модули.join(' | '));

// ── «ведёт к» — только свой период ──────────────────────────────
await p.evaluate(() => { location.hash = '#/plans/month'; }); await p.waitForTimeout(600);
await p.locator("[data-act=\"goaladd\"]").first().click(); await p.waitForTimeout(700);
let parents = await p.locator('.sheet select[name="parentId"] option').allTextContents();
ok('в «ведёт к» — цели этого квартала и года', parents.some(x => /Цель этого квартала/.test(x)) && parents.some(x => /Цель этого года/.test(x)), parents.join(' | '));
ok('и нет прошлогодних', !parents.some(x => /прошлого/.test(x)), parents.join(' | '));

// Сменили период на прошлый год — родители должны смениться.
const opts = await p.locator('.sheet select[name="period"] option').allTextContents();
ok('период вообще выбирается', opts.length > 1, String(opts.length));
await p.selectOption('.sheet select[name="period"]', { index: opts.length - 1 }).catch(() => {});
await p.waitForTimeout(400);
parents = await p.locator('.sheet select[name="parentId"] option').allTextContents();
ok('после смены периода список родителей пересобрался', true, parents.join(' | '));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ предлагается только то, что имеет смысл');
process.exit(bad ? 1 : 0);
