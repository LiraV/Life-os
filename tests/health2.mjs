// «Тело» как сфера: плитка, квест со сферой, роль — и длина квеста пошире.
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
const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. длина квеста
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.locator('[data-act="add"]').first().click(); await p.waitForTimeout(500);
const lens = await p.locator('.sheet .opts[data-name="minutes"] .opt').allInnerTexts();
console.log(' ', lens.join(' · '));
ok('вариантов длины стало девять', lens.length === 9, String(lens.length));
ok('есть короткие', lens.includes('10 мин') && lens.includes('15 мин'));
ok('есть длинные', lens.includes('3 ч') && lens.includes('4 ч'));
ok('часы пишутся часами, а не минутами', !lens.includes('180 мин') && lens.includes('2 ч'));
ok('по умолчанию всё те же 45', await p.locator('.sheet .opts[data-name="minutes"] .opt.on').innerText() === '45 мин',
  await p.locator('.sheet .opts[data-name="minutes"] .opt.on').innerText());

// ── 2. «Тело» есть в выборе сферы
const spheres = await p.locator('.sheet .opts[data-name="sphere"] .opt').allInnerTexts();
ok('«Тело» появилось в списке сфер', spheres.includes('Тело'), spheres.join(' · '));
await p.fill('.sheet input[name="title"]', 'GMT clinic');
await p.locator('.sheet .opts[data-name="sphere"] .opt', { hasText: 'Тело' }).click(); await p.waitForTimeout(200);
await p.locator('.sheet .opts[data-name="minutes"] .opt', { hasText: '3 ч' }).click(); await p.waitForTimeout(200);
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(700);
let s = await st();
const q = Object.values(s.quests).flat().find(x => x.title === 'GMT clinic');
ok('квест сохранил сферу «Тело»', q?.sphere === 'health', JSON.stringify(q?.sphere));
ok('и длину 180 минут', q?.minutes === 180, String(q?.minutes));
ok('на «Дне» видно метку сферы', /Тело/.test(await p.locator('.scr').innerText()));

// ── 3. плитка в сферах ведёт на свой экран
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
const tile = p.locator('.tile', { hasText: 'Тело' });
ok('плитка «Тело» на месте', await tile.count() === 1);
ok('подпись честная, пока ничего нет', /пока пусто/.test(await tile.innerText()), await tile.innerText().then(t => t.replace(/\n/g, ' · ')));
await tile.click(); await p.waitForTimeout(700);
ok('открывается свой экран «Тела», а не общий', await p.evaluate(() => location.hash) === '#/health',
  await p.evaluate(() => location.hash));
// у «Тела» две вкладки, по умолчанию открыт «Сейчас» с циклом
ok('и это правда экран тела', /Дом, а не проект/.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).split('\n').slice(0, 3).join(' · '));

// ── 4. подпись плитки оживает от отметок
await p.evaluate(days => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.sleep = {}; days.forEach(d => { x.sleep[d] = 8; });
  localStorage.setItem('lifeos.state', JSON.stringify(x));
}, [iso(0), iso(1), iso(2)]);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
ok('подпись показывает средний сон', /сон 8 ч в среднем/.test(await p.locator('.tile', { hasText: 'Тело' }).innerText()),
  await p.locator('.tile', { hasText: 'Тело' }).innerText().then(t => t.replace(/\n/g, ' · ')));

// ── 5. роль «Целительница» питается от тела
const parts = await p.evaluate(async () => {
  const m = await import('./app/js/selectors.js');
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().slice(0, 10); });
  return { health: m.sphereParts('health', days), role: m.roles().find(r => r.name === 'Целительница') };
});
console.log(' ', JSON.stringify(parts.health));
ok('«Тело» приносит ночи и замеры', parts.health.some(x => x.label === 'ночи' && x.n === 3), JSON.stringify(parts.health));
ok('роль это видит', parts.role && parts.role.n >= 3, JSON.stringify(parts.role?.n));

// ── 6. сферу можно убрать с глаз, как любую
await p.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('lifeos.state'));
  x.spheresHidden = ['health'];
  localStorage.setItem('lifeos.state', JSON.stringify(x));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/spheres'; }); await p.waitForTimeout(700);
ok('скрытая сфера уходит с плиток', await p.locator('.tile', { hasText: 'Тело' }).count() === 0);
ok('и лежит в «убраны с глаз»', /Тело/.test(await p.locator('.card', { hasText: 'УБРАНЫ' }).innerText().catch(() => '')));

// ── 7. старым данным роль проставилась
await p.evaluate(() => {
  localStorage.setItem('lifeos.state', JSON.stringify({ v: 43, onboarded: true, user: { name: 'Старая', chronotype: 'сова' } }));
});
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
s = await st();
ok('роль «Тела» — та же, что у питания', s.roleOf.health === 'healer', JSON.stringify(s.roleOf.health));

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
