// Свои сферы: шаблон, механики, роли, трекер, цели, скрытие.
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

// ── роли: набор вырос, раскладка переехала в данные
const r0 = await p.evaluate(async () => (await import('./app/js/selectors.js')).roles().map(x => ({ id: x.id, name: x.name, keys: x.keys })));
ok(`ролей стало восемь (${r0.length})`, r0.length === 8);
ok('«Работа» больше не сирота', r0.find(r => r.id === 'master')?.keys.includes('work'));
ok('«Страны» привязаны к роли', r0.find(r => r.id === 'wanderer')?.keys.includes('trips'));
ok('раскладка лежит в данных', Object.keys((await st()).roleOf).includes('sport'));

// ── создание сферы из шаблона «Практика»
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
ok('на сферах есть кнопка своей сферы', await p.locator('[data-act="newsphere"]').count() === 1);
await p.locator('[data-act="newsphere"]').click(); await p.waitForTimeout(500);
const tplSheet = await p.locator('.sheet').innerText();
ok('предлагаются заготовки', /Практика/.test(tplSheet) && /Список дел/.test(tplSheet) && /С нуля/.test(tplSheet));
ok('сказано, что заготовка ничего не создаёт', /ничего не появится/.test(tplSheet));
ok('до выбора сфер не прибавилось', (await st()).customSpheres.length === 0);

await p.locator('[data-act="tpl"][data-v="practice"]').click(); await p.waitForTimeout(600);
const form = await p.locator('.sheet').innerText();
ok('форма заполнена заготовкой', (await p.locator('input[name="name"]').inputValue()) === 'Практика');
ok('журнал отмечен, этапы нет', await p.locator('input[name="log"]').isChecked() && !(await p.locator('input[name="steps"]').isChecked()));
ok('есть выбор роли', await p.locator('select[name="role"]').count() === 1);
await p.fill('input[name="name"]', 'Музыка');
// значка больше нет — у своей сферы обложка из набора
await p.locator('.opt.pic[data-value="read"]').click();
await p.locator('select[name="role"]').selectOption('artist');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);

const s1 = await st();
const sp = s1.customSpheres[0];
ok('сфера создалась', sp && sp.name === 'Музыка' && sp.art === 'read');
ok('механика записалась одна', JSON.stringify(sp.kinds) === JSON.stringify(['log']));
ok('роль привязалась', s1.roleOf[sp.key] === 'artist');
ok('открылась сама сфера', (await p.evaluate(() => location.hash)).endsWith(sp.key));

// ── журнал
const scr = await p.locator('.scr').innerText();
ok('на экране журнал, а не этапы', /ЖУРНАЛ/i.test(scr) && !/ЭТАПЫ/i.test(scr));
// у своей сферы теперь такая же обложка, как у встроенных, а не эмодзи
ok('в шапке обложка, а не значок', await p.locator('.hero-img').count() === 1 && await p.locator('.hero-emoji').count() === 0);
await p.locator(`[data-act="logtick"][data-d="${today}"]`).click(); await p.waitForTimeout(500);
ok('отметка записалась', (await st()).spheres[sp.key].log[today] === 1);
await p.locator(`[data-act="logtick"][data-d="${today}"]`).click(); await p.waitForTimeout(500);
ok('повторный тап снимает', !(await st()).spheres[sp.key].log[today]);
await p.locator('[data-act="logset"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="n"]', '3');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
ok('вписанное число сохранилось', (await st()).spheres[sp.key].log[today] === 3);

// ── роль ожила от своей сферы
const r1 = await p.evaluate(async () => (await import('./app/js/selectors.js')).roles().find(x => x.id === 'artist'));
ok(`роль «Артистка» ожила от своей сферы (${r1.state})`, r1.n > 0 && r1.parts.some(x => x.label === 'отметки'));

// ── трекер видит журнал строкой
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(900);
ok('в трекере появилась строка сферы', /Музыка/.test(await p.locator('.scr').innerText()));

// ── цель отсюда
await p.evaluate(k => { location.hash = '#/spheres/' + k; }, sp.key); await p.waitForTimeout(700);
ok('на своей сфере есть кнопка цели', await p.locator('[data-act="spheregoal"]').count() === 1);
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
ok('уточнение не спрашивают — сфера и есть уточнение', await p.locator('select[name="ref"]').count() === 0);
await p.fill('input[name="target"]', '5');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const goal = (await st()).goals[0];
ok('цель завелась с источником своей сферы', goal?.src?.kind === 'sphereLog' && goal.src.ref === sp.key);
const cnt = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.counterOf(m.liveGoals()[0]);
});
ok(`счёт идёт по журналу (${cnt.current})`, cnt.current === 1 && cnt.auto === true);

// ── квест может ссылаться на свою сферу
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(700);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
const opts = await p.locator('.sheet').innerText();
ok('своя сфера есть в выборе сферы квеста', /Музыка/.test(opts));
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// ── скрытие встроенной сферы
await p.evaluate(() => { location.hash = '#/spheres/work'; }); await p.waitForTimeout(700);
await p.locator('[data-act="sphereedit"]').click(); await p.waitForTimeout(500);
const built = await p.locator('.sheet').innerText();
ok('у встроенной сферы имя не правится', await p.locator('input[name="name"]').count() === 0);
ok('но роль сменить можно', await p.locator('select[name="role"]').count() === 1);
await p.locator('input[name="hide"]').check();
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
const grid = await p.locator('.grid2').innerText();
ok('скрытая сфера ушла с плиток', !/Работа/.test(grid));
ok('и лежит в «убраны с глаз»', /Убраны с глаз/i.test(await p.locator('.scr').innerText()));
await p.locator('[data-act="unhide"]').first().click(); await p.waitForTimeout(600);
ok('вернуть можно одним тапом', /Работа/.test(await p.locator('.grid2').innerText()));

// ── убранная своя сфера: данные целы
await p.evaluate(k => { location.hash = '#/spheres/' + k; }, sp.key); await p.waitForTimeout(700);
await p.locator('[data-act="sphereedit"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="danger"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const s2 = await st();
ok('сфера ушла из списка', s2.customSpheres[0].archived === true);
ok('но журнал остался', s2.spheres[sp.key].log[today] === 3);
ok('и цель никуда не делась', s2.goals.length === 1);

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
