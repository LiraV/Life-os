// «Осознанность»: практики, бегунок, журнал.
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

// ── вкладка
await p.evaluate(() => { location.hash = '#/inside/mind'; }); await p.waitForTimeout(800);
const scr = await p.locator('.scr').innerText();
ok('вкладка «Осознанность» есть', /Осознанность/.test(scr));
ok('семь практик на месте', await p.locator('[data-act="mindstart"]').count() === 7);
ok('сказано, что это не терапия', /не терапия и не лечение/.test(scr));
ok('пустой журнал не ругается', /Записей пока нет/.test(scr));

// ── описание практики с источником
await p.locator('[data-act="mindabout"][data-v="sigh"]').click(); await p.waitForTimeout(500);
const about = await p.locator('.sheet').innerText();
ok('у практики указан источник', /Balban/.test(about) && /Cell Reports Medicine/.test(about));
ok('и длина круга', /11 секунд/.test(about));
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(400);

// ── расчёт фаз
const phases = await p.evaluate(async () => {
  const m = await import('./app/js/mind.js');
  const box = m.practiceById('box');
  return {
    len: m.cycleSecs(box),
    at0: m.phaseAt(box, 0).phase.label,
    at5: m.phaseAt(box, 5).phase.label,
    at9: m.phaseAt(box, 9).phase.label,
    wrap: m.phaseAt(box, 17).phase.label,
    step: m.stepAt(m.practiceById('body'), 100, 600),
  };
});
ok('круг коробочного дыхания — 16 секунд', phases.len === 16);
ok('фазы идут по порядку', phases.at0 === 'вдох' && phases.at5 === 'задержка' && phases.at9 === 'выдох');
ok('после круга начинается заново', phases.wrap === 'вдох');
ok('шаг сканирования считается от общего времени', phases.step.i === 2);

// ── прогон практики
await p.locator('[data-act="mindstart"][data-v="box"]').click(); await p.waitForTimeout(500);
ok('спрашивают длительность и отметку до', await p.locator('.opts[data-name="minutes"]').count() === 1
   && await p.locator('input[name="before"]').count() === 1);
await p.locator('input[name="before"]').fill('70');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(900);
ok('круг появился', await p.locator('#m_circle').count() === 1);
const phase1 = await p.locator('#m_phase').innerText();
ok(`фаза подписана («${phase1}»)`, /вдох|задержка|выдох/.test(phase1));
const t1 = await p.locator('#m_left').innerText();
await p.waitForTimeout(1600);
const t2 = await p.locator('#m_left').innerText();
ok(`время идёт (${t1} → ${t2})`, t1 !== t2);
const scaled = await p.evaluate(() => document.getElementById('m_circle').style.transform);
ok(`круг масштабируется (${scaled})`, /scale\(/.test(scaled));

// ── досрочное завершение записывает то, что успела
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const fin = await p.locator('.sheet').innerText();
ok('после практики спрашивают «а сейчас»', /А сейчас насколько/.test(fin));
await p.locator('input[name="after"]').fill('40');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const rec = (await st()).mind[0];
ok('запись сохранилась', rec && rec.key === 'box');
ok('отметки до и после записаны', rec.before === 70 && rec.after === 40);
ok('минуты — то, что успела, а не заявленное', rec.minutes < 1);

// ── «не записывать» ничего не пишет
await p.locator('[data-act="mindstart"][data-v="quiet"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(600);
ok('«не записывать» ничего не добавило', (await st()).mind.length === 1);

// ── без отметки «до» не спрашивают «после»
await p.locator('[data-act="mindstart"][data-v="long"]').click(); await p.waitForTimeout(500);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
const noBefore = await p.locator('.sheet').innerText();
ok('без «до» не спрашивают «после»', /не ставила/.test(noBefore) && await p.locator('input[name="after"]').count() === 0);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
const rec2 = (await st()).mind.find(x => x.key === 'long');
ok('запись без отметок всё равно сохранилась', rec2 && rec2.before === null && rec2.after === null);

// ── заземление идёт шагами без таймера
await p.locator('[data-act="mindstart"][data-v="senses"]').click(); await p.waitForTimeout(500);
const s1 = await p.locator('.sheet').innerText();
ok('заземление начинается сразу, без выбора минут', /1 из 5/.test(s1) && /пять вещей/.test(s1));
for (let i = 0; i < 4; i++) { await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(400); }
ok('дошли до пятого шага', /5 из 5/.test(await p.locator('.sheet').innerText()));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
ok('в конце предлагается записать', /Готово/.test(await p.locator('.sheet').innerText()));
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(500);

// ── журнал и сдвиг
const stats = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const d = await import('./app/js/dates.js');
  return { shift: m.mindShift(), days: m.mindMonth(d.monthKey(d.todayISO())) };
});
ok('сдвиг считается только по записям с обеими отметками', stats.shift.n === 1 && stats.shift.delta === -30);
ok('дни месяца считаются', stats.days === 1);
const after = await p.locator('.scr').innerText();
ok('на экране виден разбор «до → после»', /70 → 40/.test(after));
ok('и оговорка, что это не эффект практики', /а не эффект практики/.test(after));

// ── цель «отсюда» и трекер
await p.locator('[data-act="spheregoal"]').click(); await p.waitForTimeout(500);
await p.fill('input[name="target"]', '12');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(800);
const goal = (await st()).goals[0];
ok('цель на практику завелась', goal?.src?.kind === 'mindDays');
ok('и не получила несуществующую сферу', goal.sphere === '');
const gc = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return m.counterOf(m.liveGoals()[0]);
});
ok(`цель считает дни с практикой (${gc.current})`, gc.current === 1 && gc.auto === true);
await p.evaluate(() => { location.hash = '#/inside/mind'; }); await p.waitForTimeout(700);
ok('цель видна на самом экране', /Дней с практикой/.test(await p.locator('.scr').innerText()));
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(900);
ok('в трекере есть строка осознанности', /Осознанность/.test(await p.locator('.scr').innerText()));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
