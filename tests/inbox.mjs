// Инбокс: положить без решения, потом перенести в планер.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(600);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { closeSheet } = await import('./app/js/ui.js');
  update(s => { s.ui.tips = 'off'; }); closeSheet();
  const raw = localStorage.getItem('lifeos.state');
  if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const today = await p.evaluate(async () => (await import('./app/js/dates.js')).todayISO());

// ── кладём одной строкой
await p.evaluate(() => { location.hash = '#/inbox'; }); await p.waitForTimeout(700);
ok('пустой инбокс не ругается', /Инбокс пуст/.test(await p.locator('.scr').innerText()));
const quick = p.locator('input[data-act-enter="quickadd"]');
await quick.fill('Записаться к стоматологу'); await quick.press('Enter'); await p.waitForTimeout(600);
ok('запись легла без даты и сферы', (await st()).inbox.length === 1
   && (await st()).inbox[0].sphere === '' && (await st()).inbox[0].text === 'Записаться к стоматологу');
await quick.fill('   '); await quick.press('Enter'); await p.waitForTimeout(400);
ok('пустая строка молча игнорируется', (await st()).inbox.length === 1);

for (const t of ['Купить гитарные струны', 'Прочитать про Грузию', 'Разобрать шкаф']) {
  await quick.fill(t); await quick.press('Enter'); await p.waitForTimeout(400);
}
ok('в инбоксе четыре записи', (await st()).inbox.length === 4);
const list = await p.locator('.scr').innerText();
ok('новое сверху', list.indexOf('Разобрать шкаф') < list.indexOf('Записаться к стоматологу'));
ok('видно, сколько лежит', /сегодня/.test(list));

// ── в сегодня одним тапом
const rowOf = t => p.locator('.card').filter({ hasText: t }).first();
await rowOf('Разобрать шкаф').locator('[data-act="today"]').click(); await p.waitForTimeout(700);
const s1 = await st();
ok('стало квестом на сегодня', (s1.quests[today] || []).some(q => q.title === 'Разобрать шкаф'));
ok('и ушло из инбокса', s1.inbox.length === 3 && !s1.inbox.some(x => x.text === 'Разобрать шкаф'));

// ── в цель
await rowOf('Прочитать про Грузию').locator('[data-act="move"]').click(); await p.waitForTimeout(500);
const dest = await p.locator('.sheet').innerText();
ok('предлагаются четыре направления', /В день/.test(dest) && /В цель/.test(dest) && /В сферу/.test(dest) && /В заботу/.test(dest));
await p.locator('[data-act="to"][data-v="goal"]').click(); await p.waitForTimeout(600);
await p.locator('.opts[data-name="horizon"] .opt[data-value="year"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const s2 = await st();
const goal = s2.goals.find(g => g.title === 'Прочитать про Грузию');
ok('стало целью года', goal && goal.horizon === 'year' && goal.period === today.slice(0, 4));
ok('и ушло из инбокса', !s2.inbox.some(x => x.text === 'Прочитать про Грузию'));

// ── в сферу, со сферой из записи
await rowOf('Купить гитарные струны').locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
await p.locator('.opts[data-name="sphere"] .opt[data-value="work"]').click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('сфера записалась', (await st()).inbox.find(x => x.text === 'Купить гитарные струны').sphere === 'work');
await rowOf('Купить гитарные струны').locator('[data-act="move"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="to"][data-v="sphere"]').click(); await p.waitForTimeout(600);
ok('сфера подставилась из записи', (await p.locator('select[name="key"]').inputValue()) === 'work');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const s3 = await st();
ok('стало этапом сферы', s3.spheres.work.items.some(i => i.title === 'Купить гитарные струны'));

// ── в заботу
await rowOf('Записаться к стоматологу').locator('[data-act="move"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="to"][data-v="care"]').click(); await p.waitForTimeout(600);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const s4 = await st();
const care = s4.care.items.find(i => i.name === 'Записаться к стоматологу');
ok('стало делом заботы раз в год', care && care.every === 12);
ok('«последний раз» не выдуман', care.last === '');
ok('инбокс разобран до конца', s4.inbox.length === 0);

// ── быстрая запись с «Дня» и счётчик
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
ok('пока инбокс пуст, строки о нём нет', !/В инбоксе/.test(await p.locator('.scr').innerText()));
await p.locator('[data-act="inbox"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="text"]', 'Позвонить маме');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('запись пришла с «Дня»', (await st()).inbox.length === 1);
ok('на «Дне» видно счётчик', /В инбоксе 1/.test(await p.locator('.scr').innerText()));
await p.locator('[data-act="toinbox"]').click(); await p.waitForTimeout(700);
ok('строка ведёт в инбокс', (await p.evaluate(() => location.hash)).includes('inbox'));

// ── убрать без переноса
await rowOf('Позвонить маме').locator('[data-act="edit"]').first().click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
ok('запись убралась совсем', (await st()).inbox.length === 0);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
