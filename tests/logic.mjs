// Проверки логики, а не экранов: импортируем настоящие модули в странице и
// спрашиваем их напрямую. Реестр источников, арифметика денег, живучесть
// экрана на вкладке из старой версии.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const ready = () => p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);

// ── реестр источников для динамических целей ────────────────────
const reg = await p.evaluate(async () => {
  const { SOURCES } = await import('/app/js/selectors.js');
  const out = { bad: [], n: 0 };
  const ranges = {
    month: { from: '2026-08-01', to: '2026-08-31', period: '2026-08' },
    quarter: { from: '2026-07-01', to: '2026-09-30', period: '2026-Q3' },
    year: { from: '2026-01-01', to: '2026-12-31', period: '2026' },
  };
  for (const [key, s] of Object.entries(SOURCES)) {
    out.n++;
    if (!s.sphere) out.bad.push(`${key}: нет sphere`);
    if (!s.name) out.bad.push(`${key}: нет name`);
    if (!Array.isArray(s.horizons) || !s.horizons.length) out.bad.push(`${key}: нет horizons`);
    if (s.unit == null && !s.unitOf) out.bad.push(`${key}: нет ни unit, ни unitOf`);
    if (s.ref && !s.refName) out.bad.push(`${key}: есть ref, нет refName`);
    if (typeof s.count !== 'function') { out.bad.push(`${key}: нет count`); continue; }
    for (const h of s.horizons) {
      const r = ranges[h];
      if (!r) { out.bad.push(`${key}: неизвестный горизонт ${h}`); continue; }
      let refs = [''];
      if (s.ref) { try { refs = (s.ref() || []).map(x => x.value); } catch (e) { out.bad.push(`${key}: ref() упал — ${e.message}`); } }
      if (!refs.length) refs = [''];
      for (const ref of refs) {
        let v;
        try { v = s.count(ref, r, r.period, { src: { kind: key, ref } }); }
        catch (e) { out.bad.push(`${key}/${h}/${ref}: count упал — ${e.message}`); continue; }
        if (typeof v !== 'number' || !Number.isFinite(v)) out.bad.push(`${key}/${h}/${ref}: count вернул ${JSON.stringify(v)}`);
      }
    }
  }
  return out;
});
ok(`все ${reg.n} источников целы`, reg.bad.length === 0, reg.bad.join(' | '));

// ── деньги: остаток и суммы по видам ────────────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.budget.start = 1000;
  s.budget.ops = [
    { id: 'o1', kind: 'income', sum: 5000, date: '2026-07-10', cat: '' },
    { id: 'o2', kind: 'expense', sum: 2000, date: '2026-07-20', cat: '' },
    { id: 'o3', kind: 'save', sum: 1000, date: '2026-07-25', cat: '', vault: 'v1' },
    { id: 'o4', kind: 'income', sum: 700, date: '2026-08-05', cat: '' },
    { id: 'o5', kind: 'expense', sum: 300, date: '2026-08-06', cat: '' },
  ];
  s.budget.vaults = [{ id: 'v1', name: 'Копилка', target: 5000 }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await ready();
const m = await p.evaluate(async () => {
  const S = await import('/app/js/selectors.js');
  return { july: S.balanceAt('2026-07'), aug: S.balanceAt('2026-08'), june: S.balanceAt('2026-06'),
    inc: S.sumBy('2026-07', 'income'), exp: S.sumBy('2026-07', 'expense'), save: S.sumBy('2026-07', 'save') };
});
ok('остаток за июль', m.july === 3000, String(m.july));
ok('остаток за август копит июльский', m.aug === 3400, String(m.aug));
ok('до первой операции — стартовая сумма', m.june === 1000, String(m.june));
ok('доходы, расходы и отложенное считаются раздельно', m.inc === 5000 && m.exp === 2000 && m.save === 1000,
  `${m.inc}/${m.exp}/${m.save}`);
// «Деньги пишутся одинаково»: копейки округляются везде одинаково.
const fmt = await p.evaluate(async () => (await import('/app/js/ui.js')).money(1500.5));
ok('деньги округляются', fmt === '1 501 ₽'.replace(' ', ' ') || fmt.replace(/ /g, ' ') === '1 501 ₽', fmt);

// ── вкладка из старой версии не роняет экран ────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  for (const k of ['budTab', 'studyTab', 'planTab', 'workTab', 'bodyTab', 'careTab', 'tripTab', 'bookTab', 'sportTab', 'insideTab']) s.ui[k] = 'из-старой-версии';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.reload();
});
await ready();
for (const scr of ['budget', 'study', 'plans', 'work', 'health', 'care', 'trips', 'library', 'sport', 'inside']) {
  await p.evaluate(h => { location.hash = '#/' + h; }, scr);
  await p.waitForTimeout(220);
  const r = await p.evaluate(() => ({
    broke: document.getElementById('scr').innerText.includes('Экран не открылся'),
    on: document.querySelectorAll('#scr .pill.on').length,
  }));
  ok(`«${scr}» пережил чужую вкладку`, !r.broke && r.on === 1, r.broke ? 'экран упал' : `активных вкладок: ${r.on}`);
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ логика на месте');
process.exit(bad ? 1 : 0);
