// Пол в профиле: обращение, нормы тела и тумблер цикла.
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

// онбординг спрашивает пол
ok('онбординг предлагает выбрать пол', await p.locator('[data-act="sex"]').count() === 2);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; }); closeSheet();
    const raw = localStorage.getItem('lifeos.state');
    if (raw) { const cur = JSON.parse(raw); (cur.ui ||= {}).tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(cur)); }
  } catch {}
});

const setUser = props => p.evaluate(async o => {
  const { update } = await import('./app/js/store.js');
  update(s => Object.assign(s.user, o));
}, props);

// ── расчёты: женщина 30 лет, 165 см, 60 кг, талия 74
await setUser({ sex: 'f', birth: '1996-03-01', height: 165, activity: 55 });
await p.evaluate(async () => {
  const { update, uid } = await import('./app/js/store.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => { s.health.measures.push({ id: uid(), date: todayISO(), weight: 60, waist: 74, hips: 95, sleep: 8 }); });
});
const f = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { age: m.age(), bmi: m.bmi(), en: m.energyNeed(), waist: m.waistRisk() };
});
console.log('  женщина:', JSON.stringify({ age: f.age, bmi: f.bmi.value, bmr: f.en.bmr, tdee: f.en.tdee, waist: f.waist.warn }));
ok('возраст из даты рождения', f.age === 30);
ok('ИМТ 22.0 и «норма»', f.bmi.value === 22 && f.bmi.band === 'норма');
// Миффлин ж: 10*60 + 6.25*165 - 5*30 + (-161) = 600 + 1031.25 - 150 - 161 = 1320.25 → 1320
ok('расход покоя по Миффлину для женщины = 1320', f.en.bmr === 1320);
ok('порог талии у женщин 80 см, 74 — ниже', f.waist.warn === 80 && f.waist.level === 'ok');

// ── тот же человек, но пол мужской: формула и пороги другие
await setUser({ sex: 'm' });
const m = await p.evaluate(async () => {
  const x = await import('./app/js/selectors.js');
  return { bmi: x.bmi(), en: x.energyNeed(), waist: x.waistRisk() };
});
console.log('  мужчина:', JSON.stringify({ bmi: m.bmi.value, bmr: m.en.bmr, waist: m.waist.warn }));
// Миффлин м: 600 + 1031.25 - 150 + 5 = 1486.25 → 1486
ok('расход покоя для мужчины = 1486', m.en.bmr === 1486);
ok('порог талии у мужчин 94 см', m.waist.warn === 94);
ok('ИМТ от пола не зависит', m.bmi.value === f.bmi.value);

// ── обращение
const words = () => p.evaluate(async () => {
  const { roles } = await import('./app/js/selectors.js');
  const { titleFor, nameOf } = await import('./app/js/traits.js');
  const { gv } = await import('./app/js/gender.js');
  return { roles: roles().map(r => r.name), t3: titleFor(3), t5: titleFor(5), trait: nameOf('Летописица'), verb: gv('дочитал') };
});
const wm = await words();
ok('роли в мужском роде', wm.roles.includes('Учёный') && wm.roles.includes('Хранитель') && wm.roles.includes('Артист'));
ok('титулы в мужском роде', wm.t3 === 'Хозяин недели' && wm.t5 === 'Хранитель глав');
ok('черта в мужском роде', wm.trait === 'Летописец');
ok('глагол в мужском роде', wm.verb === 'дочитал');
await setUser({ sex: 'f' });
const wf = await words();
ok('смена пола сразу возвращает женский род', wf.roles.includes('Учёная') && wf.t3 === 'Хозяйка недели' && wf.trait === 'Летописица' && wf.verb === 'дочитала');

// ── цикл: тумблер прячет раздел, отметки живы
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  const { todayISO } = await import('./app/js/dates.js');
  update(s => { s.health.days[todayISO()] = true; });
});
await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(800);
ok('при включённом тумблере цикл виден', /Цикл/i.test(await p.locator('.scr').innerText()));
await setUser({ cycle: false }); await p.waitForTimeout(600);
const hidden = await p.locator('.scr').innerText();
ok('выключенный цикл скрывает раздел', !/Цикл/i.test(hidden));
ok('но карточка «Сложение» на месте', /Сложение/i.test(hidden));
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).health.days);
ok('отметки цикла никуда не делись', Object.keys(kept).length === 1);
await setUser({ cycle: true }); await p.waitForTimeout(600);
ok('вернули тумблер — раздел вернулся', /Цикл/i.test(await p.locator('.scr').innerText()));

// ── экран показывает посчитанное
const scr = await p.locator('.scr').innerText();
ok('на «Теле» видно ИМТ', /ИМТ/.test(scr));
ok('строка типа сложения на месте', /Тип сложения/.test(scr));
ok('без запястья она зовёт его указать', /указать запястье/.test(scr), (scr.match(/Тип сложения.{0,30}/) || [''])[0]);
ok('видно суточный расход', /Расход в сутки/.test(scr));

// ── питание берёт норму от тела
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(700);
await p.locator('[data-act="goals"]').first().click(); await p.waitForTimeout(500);
ok('в нормах есть кнопка «взять от тела»', await p.locator('[data-act="frombody"]').count() === 1);
// Кнопка теперь только подставляет число в поле — сохраняет «Сохранить»:
// иначе форма закрывалась и всё набранное в ней пропадало.
await p.locator('[data-act="frombody"]').click(); await p.waitForTimeout(400);
ok('число подставилось в поле', Number(await p.inputValue('.sheet input[name="kcal"]')) === f.en.tdee,
  await p.inputValue('.sheet input[name="kcal"]'));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(600);
const kcal = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).food.targets.kcal);
ok(`норма калорий проставилась расчётом (${kcal})`, kcal === f.en.tdee);

// ── старые данные: пол по умолчанию женский, цикл включён
const mig = await p.evaluate(async () => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 27, onboarded: true, user: { name: 'Старая', chronotype: 'сова' } }));
  const r = await fetch('./app/js/store.js');
  return r.ok;
});
ok('слепок старой версии записан', mig);
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(800);
const after = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).user);
ok('старым данным ставится женский род', after.sex === 'f');
ok('и цикл остаётся включённым', after.cycle === true);
ok('новые поля пустые, а не выдуманные', after.height === 0 && after.birth === '');
ok('запястье в профиле не спрашивается, но поле есть', after.wrist === 0, JSON.stringify(after.wrist));

// ── запястье задаётся в «Теле» и там же считает тип сложения
// Выше проверялась миграция, после неё в профиле пусто — возвращаем данные,
// иначе карточка «Сложение» показывает приглашение, а не строки.
await setUser({ sex: 'f', birth: '1996-03-01', height: 165 });
await p.evaluate(() => { location.hash = '#/health'; }); await p.waitForTimeout(700);
await p.locator('[data-act="wrist"]').click(); await p.waitForTimeout(450);
ok('шторка запястья открывается из «Тела»', await p.locator('.sheet input[name="wrist"]').count() === 1);
await p.fill('.sheet input[name="wrist"]', '16');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
const hs = await p.locator('.scr').innerText();
ok('запястье 16 у женщины — нормостеническое', /нормостеническое/.test(hs), (hs.match(/Тип сложения.{0,40}/) || [''])[0]);
ok('и записалось в профиль', await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).user.wrist) === 16);
await p.locator('[data-act="wrist"]').click(); await p.waitForTimeout(450);
await p.fill('.sheet input[name="wrist"]', '');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
ok('пустое значение убирает строку, а не рисует чушь', /указать запястье/.test(await p.locator('.scr').innerText()));

console.log(errs.length ? 'ОШИБКИ: ' + errs.join('; ') : 'ошибок нет');
console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad || errs.length ? 1 : 0);
