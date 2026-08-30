// Кривая дня учится на отметках человека: где своих данных хватает — свой
// столбец, где нет — подсказка по хронотипу. Плюс проверяем, что отметка
// ложится в блок дня, а старым отметкам время не придумывается.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const cur = JSON.parse(localStorage.getItem('lifeos.state'));
  (cur.ui ||= {}).tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(cur));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);

const curveLab = () => p.locator('.card', { hasText: 'Кривая дня' }).locator('.lab').first().innerText();
const bars = () => p.locator('.curve div').evaluateAll(els => els.map(e => e.className.trim()));

// ── 1. пока отметок нет — вся кривая подсказка
ok('без данных кривая по хронотипу', (await bars()).every(c => c.includes('pre')), (await curveLab()));
ok('своих блоков не заявлено', !/твоих блоков/.test(await curveLab()));

// ── 2. три отметки в блоке — порог, кривая начинает считать его своим
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.energy = {};
  // два дня в блоке 4 (вечер) — ещё мало
  s.energy[iso(1)] = { 4: 90 };
  s.energy[iso(2)] = { 4: 88 };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
ok('двух отметок мало — блок ещё подсказка', (await bars())[4].includes('pre'));

await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.energy[iso(3)] = { 4: 92 };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
let cls = await bars();
ok('на третьей отметке блок становится своим', cls[4].includes('own') && !cls[4].includes('pre'));
ok('остальные блоки остались подсказкой', cls.filter(c => c.includes('pre')).length === 5);
ok('в подписи видно, сколько блоков своих', /твоих блоков 1 из 6/.test(await curveLab()), await curveLab());
ok('пик уехал в свой блок', cls[4].includes('hot'), cls.join(' | '));

// ── 3. подсказка на другом блоке не сдвигается чужими данными
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  for (let i = 4; i < 10; i++) s.energy[iso(i)] = { 0: 20, 4: 90 };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
cls = await bars();
ok('второй блок с данными тоже свой', cls[0].includes('own') && cls[4].includes('own'));
ok('в подписи двое своих', /твоих блоков 2 из 6/.test(await curveLab()), await curveLab());
const hs = await p.locator('.curve div').evaluateAll(els => els.map(e => Math.round(parseFloat(e.style.height))));
ok('утро ниже вечера — кривая повторяет отметки', hs[0] < hs[4], `${hs[0]} < ${hs[4]}`);

// ── 4. отметка ползунком ложится в текущий блок
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.energy = {};
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
const slider = p.locator('input[type=range][data-act-input="energyLive"]');
await slider.evaluate(el => { el.value = 71; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForTimeout(400);
const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
// Ждать надо по таблице «час → блок», а не повторяя код приложения: копия
// логики повторила бы и её ошибку. Раньше так и было — час ночи попадал
// в «10–13», и проверка этого не замечала.
const HOUR_BLOCK = { 0: '5', 1: 'd', 2: 'd', 3: 'd', 4: 'd', 5: 'd', 6: 'd',
  7: '0', 8: '0', 9: '0', 10: '1', 11: '1', 12: '1', 13: '2', 14: '2', 15: '2',
  16: '3', 17: '3', 18: '3', 19: '4', 20: '4', 21: '4', 22: '5', 23: '5' };
const expect = HOUR_BLOCK[await p.evaluate(() => new Date().getHours())];

// Заодно проверяем всю таблицу разом, а не только текущий час.
const table = await p.evaluate(async want => {
  const { blockAt } = await import('./app/js/store.js');
  return Object.entries(want).filter(([h, w]) => {
    const got = blockAt(Number(h));
    return String(got === -1 ? 'd' : got) !== w;
  }).map(([h, w]) => `${h} ч → ${blockAt(Number(h))}, ждали ${w}`);
}, HOUR_BLOCK);
ok('каждый час суток попадает в свой блок', table.length === 0, table.join(' · '));
const rec = (await st()).energy[today];
ok('отметка ушла в текущий блок', JSON.stringify(rec) === JSON.stringify({ [expect]: 71 }), JSON.stringify(rec) + ' ждали ключ ' + expect);
ok('подпись показывает отметку', /71/.test(await p.locator('#e_out').innerText()));

// ── 5. вторая отметка в тот же день не затирает первую, если блок другой
// Второй блок выбираем не наугад: в 8 утра «нулевой» совпал бы с текущим,
// и проверка ловила бы часы прогона, а не поведение приложения.
const other = expect === '0' ? '2' : '0';
await p.evaluate(k => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const t = new Date().toISOString().slice(0, 10);
  s.energy[t] = { ...s.energy[t], [k]: 33 };
  // чтобы под кривой появилась история за 30 дней — ей нужно хотя бы два дня
  const y = new Date(); y.setDate(y.getDate() - 1);
  s.energy[y.toISOString().slice(0, 10)] = { 2: 50 };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
}, other);
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
const rec2 = (await st()).energy[today];
ok('в дне живут обе отметки', Object.keys(rec2).length === 2, JSON.stringify(rec2));
const vals = Object.values(rec2).map(Number);
const avg = Math.round(vals.reduce((a, c) => a + c, 0) / vals.length);
const spark = await p.locator('.card', { hasText: 'Кривая дня' }).innerText();
ok('история под кривой появилась', /в среднем/.test(spark), spark.replace(/\n/g, ' · ').slice(0, 120));
ok('день считается средним по своим отметкам', new RegExp(`в среднем ${Math.round((avg + 50) / 2)}`).test(spark), `ждали ${Math.round((avg + 50) / 2)} · ` + spark.replace(/\n/g, ' · ').slice(0, 120));

// ── 6. старой отметке-числу время не придумываем
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.v = 37;
  s.energy = { '2026-08-01': 64, '2026-08-02': { 3: 80 } };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
const mig = (await st()).energy;
ok('число превратилось в дневную отметку без блока', JSON.stringify(mig['2026-08-01']) === '{"d":64}', JSON.stringify(mig['2026-08-01']));
ok('блочная отметка не тронута', JSON.stringify(mig['2026-08-02']) === '{"3":80}', JSON.stringify(mig['2026-08-02']));

// ── 7. «Я» и трекер считают день по новым отметкам
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  s.energy = {};
  for (let i = 0; i < 20; i++) s.energy[iso(i)] = { 1: 60, 4: 80 };
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/me'; }); await p.waitForTimeout(700);
const meCard = await p.locator('.card', { hasText: /энергия/i }).first().innerText();
ok('на «Я» средняя энергия — 70', /70/.test(meCard), meCard.replace(/\n/g, ' · ').slice(0, 140));
await p.evaluate(() => { location.hash = '#/tracker'; }); await p.waitForTimeout(700);
const row = (await p.locator('.tr tbody tr', { hasText: /энергия/i }).innerText()).replace(/\s+/g, ' ');
ok('в трекере месяц — среднее, а не сумма', / 70\b/.test(row), row);

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
