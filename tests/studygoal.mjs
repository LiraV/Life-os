// Цели из «Учёбы»: сданные этапы и посещённые пары. Плюс карточка дня работы,
// которая однажды показала разметку текстом.
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
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
const ym = today.slice(0, 7);

await p.evaluate(([m, t]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.study.places = [{ id: 'pl', name: 'Универ' }];
  s.study.subjects = [{ id: 'sb1', placeId: 'pl', name: 'Диплом' }, { id: 'sb2', placeId: 'pl', name: 'История' }];
  s.study.tasks = [
    { id: 't1', subjectId: 'sb1', title: 'Глава 1', stage: 'done', doneAt: `${m}-05`, due: '' },
    { id: 't2', subjectId: 'sb1', title: 'Глава 2', stage: 'done', doneAt: `${m}-12`, due: '' },
    { id: 't3', subjectId: 'sb2', title: 'Реферат', stage: 'done', doneAt: `${m}-14`, due: '' },
    // Сдано когда-то давно, даты нет: в счёт идти не должно.
    { id: 't4', subjectId: 'sb1', title: 'Старое', stage: 'done', doneAt: '', due: '' },
    { id: 't5', subjectId: 'sb1', title: 'В работе', stage: 'draft', doneAt: '', due: '' },
  ];
  s.study.attend = { sb1: { [`${m}-03`]: 1, [`${m}-10`]: 1 }, sb2: { [`${m}-04`]: 1 } };
  s.work.jobs = [{ id: 'j1', name: 'Место', start: '2026-01-01', norm: 8, days: [1, 2, 3, 4, 5] }];
  s.work.days = { [t]: { j1: { type: 'work', hours: 6, where: 'office', note: '' } } };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
}, [ym, today]);
await p.waitForTimeout(900);

// ── счёт напрямую ───────────────────────────────────────────────
const calc = await p.evaluate(async m => {
  const S = await import('/app/js/selectors.js');
  const r = { from: `${m}-01`, to: `${m}-31` };
  return {
    keys: S.sourcesOf('study').map(x => x.key),
    все: S.SOURCES.studyDone.count('', r), диплом: S.SOURCES.studyDone.count('sb1', r),
    пары: S.SOURCES.studyAttend.count('', r), парыДиплом: S.SOURCES.studyAttend.count('sb1', r),
    подпись: S.SOURCES.studyDone.refName('sb1'),
  };
}, ym);
ok('в учёбе появились оба счёта', calc.keys.join(',') === 'studyDone,studyAttend', calc.keys.join(','));
ok('сданное считается по датам', calc.все === 3, String(calc.все));
ok('сданное без даты в счёт не идёт', calc.все === 3 && calc.диплом === 2, `${calc.все}/${calc.диплом}`);
ok('пары считаются по журналу', calc.пары === 3 && calc.парыДиплом === 2, `${calc.пары}/${calc.парыДиплом}`);
ok('в уточнении — предмет', calc.подпись === 'Диплом', calc.подпись);

// ── цель заводится из «Планов» ──────────────────────────────────
await p.evaluate(() => { location.hash = '#/plans/month'; }); await p.waitForTimeout(600);
await p.locator("[data-act=\"dynadd\"]").first().click(); await p.waitForTimeout(600);
const kinds = await p.locator('.sheet select[name="kind"] option').allTextContents();
ok('источник «Этапов сдано» предлагается', kinds.some(x => /Этапов сдано/.test(x)), kinds.join(', ').slice(0, 120));
await p.selectOption('.sheet select[name="kind"]', 'studyDone'); await p.waitForTimeout(500);
const refs = await p.locator('.sheet select[name="ref"] option').allTextContents();
ok('и предметы в уточнении', refs.some(x => /Диплом/.test(x)), refs.join(', '));
await p.selectOption('.sheet select[name="ref"]', 'sb1'); await p.waitForTimeout(400);
// Название у динамичной цели обязательное — приложение не выдумывает его само.
await p.fill('.sheet input[name="title"]', 'Сдать пять этапов диплома');
await p.fill('.sheet input[name="target"]', '5');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const g = (await st()).goals.slice(-1)[0];
ok('цель завелась на предмет', g?.src?.kind === 'studyDone' && g?.src?.ref === 'sb1', JSON.stringify(g?.src));
ok('и уже набрала два из пяти',
  await p.evaluate(async gg => (await import('/app/js/selectors.js')).autoCount(gg), g) === 2, '');

// ── карточка дня работы: разметка не сквозит ────────────────────
await p.evaluate(() => { location.hash = '#/work'; }); await p.waitForTimeout(600);
const w = await p.locator('#scr').innerText();
ok('часы и место читаются как текст', /· 6 ч · в офисе/.test(w), (w.match(/Работала.{0,30}/) || [''])[0]);
ok('и разметка не видна', !/<span|class="lab"/.test(w));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ цели из учёбы считаются, разметка не сквозит');
process.exit(bad ? 1 : 0);
