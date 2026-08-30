// Дневные нормы: каждая берётся от веса или от соседних, и ничего не теряется.
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
const val = n => p.inputValue(`.sheet input[name="${n}"]`);
const openGoals = async () => {
  await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(650);
  await p.locator('[data-act="goals"]').first().click(); await p.waitForTimeout(500);
};

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  s.user.height = 170; s.user.birth = '2002-02-15'; s.user.sex = 'f'; s.user.activity = 55;
  s.health.measures = [{ id: 'm1', date: '2026-08-29', weight: 67, waist: null, hips: null, extra: {} }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await openGoals();

// ── 1. кнопки у всех показателей
const sheet = await p.locator('.sheet').innerText();
ok('калории берутся от тела', /взять от тела/.test(sheet));
ok('белки — от веса', await p.locator('.sheet [data-act="fromweight"]').count() === 1);
ok('жиры — от веса', await p.locator('.sheet [data-act="fatweight"]').count() === 1, (sheet.match(/Жиры[^]{0,60}/) || [''])[0].replace(/\n/g, ' · '));
ok('углеводы — остатком', await p.locator('.sheet [data-act="carbrest"]').count() === 1);
ok('вода — от веса', await p.locator('.sheet [data-act="waterweight"]').count() === 1, (sheet.match(/Вода[^]{0,60}/) || [''])[0].replace(/\n/g, ' · '));
ok('у жиров назван диапазон', /0,8|54–80|54-80/.test(sheet) || /ориентир 54–80 г/.test(sheet), (sheet.match(/Около грамма[^]{0,60}/) || [''])[0]);

// ── 2. подстановка не закрывает форму и не теряет набранное
await p.fill('.sheet input[name="kcal"]', '1800');
await p.locator('.sheet [data-act="fatweight"]').click(); await p.waitForTimeout(350);
ok('форма осталась открытой', await p.locator('.sheet').count() === 1);
ok('жиры подставились от веса', await val('fat') === '67', await val('fat'));
ok('набранные калории не потерялись', await val('kcal') === '1800', await val('kcal'));
ok('в состоянии пока ничего не менялось', (await st()).food.targets.fat === 70, String((await st()).food.targets.fat));

await p.locator('.sheet [data-act="fromweight"]').click(); await p.waitForTimeout(300);
ok('белки — середина диапазона', await val('prot') === '94', await val('prot'));

// ── 3. углеводы считаются от того, что стоит в полях
await p.locator('.sheet [data-act="carbrest"]').click(); await p.waitForTimeout(350);
// 1800 − 94×4 − 67×9 = 1800 − 376 − 603 = 821 → 205 г
ok('углеводы — остаток калорий', await val('carb') === '205', await val('carb'));
await p.fill('.sheet input[name="kcal"]', '2200');
await p.locator('.sheet [data-act="carbrest"]').click(); await p.waitForTimeout(350);
ok('меняются вслед за калориями', await val('carb') === '305', await val('carb'));

// остатка не хватило — честно говорим, а не пишем минус
await p.fill('.sheet input[name="kcal"]', '900');
await p.locator('.sheet [data-act="carbrest"]').click(); await p.waitForTimeout(400);
ok('при нехватке углеводы не трогаются', await val('carb') === '305', await val('carb'));
ok('и сказано, чего не хватает', /не хватает \d+ ккал/.test(await p.locator('.toast').innerText().catch(() => '')),
  await p.locator('.toast').innerText().catch(() => 'тоста нет'));

// ── 4. вода от веса
await p.locator('.sheet [data-act="waterweight"]').click(); await p.waitForTimeout(350);
ok('вода 30 мл на кг, округлённая', await val('water') === '2000', await val('water'));

// ── 5. сохраняется всё разом
await p.fill('.sheet input[name="kcal"]', '1742');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
const tg = (await st()).food.targets;
ok('нормы сохранились одним махом', tg.kcal === 1742 && tg.prot === 94 && tg.fat === 67 && tg.water === 2000,
  JSON.stringify(tg));

// ── 6. без веса кнопок нет, но форма работает
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.health.measures = [];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await openGoals();
ok('без веса кнопки от веса не показываются',
  await p.locator('.sheet [data-act="fatweight"]').count() === 0
  && await p.locator('.sheet [data-act="waterweight"]').count() === 0
  && await p.locator('.sheet [data-act="fromweight"]').count() === 0);
ok('остаток по калориям считается и без веса', await p.locator('.sheet [data-act="carbrest"]').count() === 1);
await p.locator('.sheet [data-act="carbrest"]').click(); await p.waitForTimeout(350);
ok('и он работает', Number(await val('carb')) > 0, await val('carb'));

// ── 7. счёт остатка проверяем напрямую
const calc = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  return { ok1: m.carbRest(2000, 100, 60), bad1: m.carbRest(500, 100, 60), zero: m.carbRest(0, 0, 0) };
});
ok('2000 − 400 − 540 = 1060 → 265 г', calc.ok1.g === 265, JSON.stringify(calc.ok1));
ok('нехватка помечена и грамм не выдумано', calc.bad1.enough === false && calc.bad1.g === 0, JSON.stringify(calc.bad1));
ok('нули не ломают счёт', calc.zero.g === 0 && calc.zero.enough === true, JSON.stringify(calc.zero));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
