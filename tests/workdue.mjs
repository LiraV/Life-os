// Сроки и отметки на доске работы. Случай, из-за которого это переделано:
// у карточки стоял срок «8-е — заменить креативы». Креативы заменили в срок,
// а карточка продолжала числиться просроченной полмесяца, потому что срок
// висел на всей задаче. Пришлось удалить задачу целиком.
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
const card = async () => (await st()).work.tasks[0];

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const past = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 10); return d.toISOString().slice(0, 10); });
const soon = await p.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10); });
await p.evaluate(([pastD, soonD]) => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; s.ui.workTab = 'board';
  s.work.jobs = [{ id: 'j1', name: 'Студия', company: 'Студия', start: '2026-01-01' }];
  s.work.tasks = [{
    id: 't1', jobId: 'j1', projectId: '', column: 'rk-live', type: 'РК', title: 'Йошкар-Ола',
    platforms: [], month: '', day: '', deadline: '', doneFrom: '',
    request: '', budget: '', split: '', urgent: false, links: '', notes: '',
    checklist: [
      { id: 'c1', text: 'Заменить креативы', done: false, due: pastD },
      { id: 'c2', text: 'Финальный отчёт', done: false, due: soonD },
    ],
    creatives: [], movedAt: '',
  }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.hash = '#/work/board';
  location.reload();
}, [past, soon]);
await p.waitForFunction(() => document.querySelector('.kb-card'), null, { timeout: 20000 });
await p.waitForTimeout(400);

// ── горит ближайший живой срок, и видно чей ─────────────────────
let t = await p.locator('.kb-card').innerText();
ok('карточка горит просроченным', /просрочен/.test(t), t.replace(/\n/g, ' · ').slice(0, 120));
ok('и сказано, какой именно пункт', /Заменить креативы/.test(t), t.match(/просрочен[^\n]*/)?.[0]);

// ── закрыли пункт — срок ушёл вместе с ним ──────────────────────
await p.locator('.kb-card .kb-title').click(); await p.waitForTimeout(600);
await p.locator('.sheet [data-act="cltoggle"]').first().click(); await p.waitForTimeout(400);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
t = await p.locator('.kb-card').innerText();
ok('просрочка ушла вместе с закрытым пунктом', !/просрочен/.test(t), t.replace(/\n/g, ' · ').slice(0, 120));
ok('а следующий срок показан', /📅/.test(t), t.match(/📅[^\n]*/)?.[0]);
ok('и он от второго пункта', /Финальный отчёт/.test(t), t.match(/📅[^\n]*/)?.[0]);

// ── срок самой задачи виден без подписи о пункте ────────────────
await p.evaluate(async d => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.work.tasks[0].deadline = d; s.work.tasks[0].checklist[1].done = true; });
}, soon);
await p.waitForTimeout(400);
t = await p.locator('.kb-card').innerText();
ok('свой срок карточки показан', /📅/.test(t), t.match(/📅[^\n]*/)?.[0]);
ok('и без имени пункта', !/Финальный отчёт/.test(t.match(/📅[^\n]*/)?.[0] || ''));

// ── срок можно снять ────────────────────────────────────────────
await p.locator('.kb-card .kb-title').click(); await p.waitForTimeout(600);
ok('в шторке есть «убрать срок»', await p.locator('.sheet [data-act="nodl"]').count() === 1);
await p.locator('.sheet [data-act="nodl"]').click(); await p.waitForTimeout(300);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('срок снялся', (await card()).deadline === '', JSON.stringify((await card()).deadline));
ok('и с карточки пропал', !/📅/.test(await p.locator('.kb-card').innerText()));

// ── отметить готовой прямо на доске ─────────────────────────────
ok('на карточке есть галочка', await p.locator('.kb-card [data-act="carddone"]').count() === 1);
await p.locator('.kb-card [data-act="carddone"]').click(); await p.waitForTimeout(600);
let c = await card();
ok('карточка закрыта', c.column === 'done', c.column);
ok('и помнит, откуда закрыли', c.doneFrom === 'rk-live', c.doneFrom);
ok('день переноса проставлен', !!c.movedAt, c.movedAt);

await p.locator('.kb-card [data-act="carddone"]').click(); await p.waitForTimeout(600);
c = await card();
ok('снятая галочка вернула её туда же', c.column === 'rk-live', c.column);
ok('и метка возврата очистилась', c.doneFrom === '', JSON.stringify(c.doneFrom));

// ── прочая задача закрывается в свою колонку ────────────────────
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.work.tasks[0].type = 'Прочее'; s.work.tasks[0].column = 'ot-progress'; });
});
await p.waitForTimeout(400);
await p.locator('.kb-card [data-act="carddone"]').click(); await p.waitForTimeout(600);
ok('прочая уходит в «Готово», а не в архив РК', (await card()).column === 'ot-done', (await card()).column);

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ сроки и отметки на месте');
process.exit(bad ? 1 : 0);
