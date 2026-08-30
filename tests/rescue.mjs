// Сломанная миграция не должна стоить данных.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
let bad = 0;
const ok = (n, c) => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}`); };

const MINE = JSON.stringify({ v: 35, onboarded: true, user: { name: 'Лера', xp: 952 },
  diary: [{ id: 'd', date: '2026-08-20', text: 'важная запись' }],
  work: { jobs: [], days: {}, tasks: [], wins: [] } });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
// Ломаем миграцию так же, как это случилось на самом деле: битый JSON.
await p.evaluate(() => localStorage.setItem('lifeos.state', '{ это не json'));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
ok('приложение говорит, что данные не прочитались', /не прочитались/.test(await p.locator('.scr').innerText()));
ok('и не делает вид, что всё хорошо', /ничего не записывает/.test(await p.locator('.scr').innerText()));
ok('сырой текст отложен в копию',
   (await p.evaluate(() => localStorage.getItem('lifeos.state.rescue'))) === '{ это не json');
ok('есть кнопка скачать копию', await p.locator('[data-rescue="save"]').count() === 1);

// главное: сохранение не перезаписало нечитаемое
await p.waitForTimeout(800);
ok('нечитаемые данные не затёрты',
   (await p.evaluate(() => localStorage.getItem('lifeos.state'))) === '{ это не json');

// и никакая работа в приложении не пишет поверх
await p.evaluate(async () => {
  const { update } = await import('./app/js/store.js');
  update(s => { s.user.xp = 1; });
});
await p.waitForTimeout(700);
ok('правка состояния тоже не пишет поверх',
   (await p.evaluate(() => localStorage.getItem('lifeos.state'))) === '{ это не json');

// «начать заново» — осознанно и только по кнопке
await p.evaluate(() => { window.confirm = () => true; });
await p.locator('[data-rescue="fresh"]').click(); await p.waitForTimeout(1200);
ok('после «начать заново» копия убрана',
   (await p.evaluate(() => localStorage.getItem('lifeos.state.rescue'))) === null);
ok('и запись снова работает',
   (await p.evaluate(() => localStorage.getItem('lifeos.state')))?.startsWith('{"v"'));

// целое состояние прошлой версии проходит миграцию без потерь
await p.evaluate(m => localStorage.setItem('lifeos.state', m), MINE);
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(900);
const s = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
ok('целые данные прошлой версии не теряются', s.user.name === 'Лера' && s.user.xp === 952 && s.diary.length === 1);
// Текущую версию спрашиваем у самого приложения: тест про сохранность
// данных не должен ломаться от каждого обновления формата.
await p.evaluate(() => localStorage.removeItem('lifeos.state'));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
const fresh = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).v);
ok(`и версия поднялась до текущей (${s.v})`, s.v === fresh);

// ── снимок перед сменой формата
await p.evaluate(m => localStorage.setItem('lifeos.state', m), MINE);
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(800);
const prev = await p.evaluate(() => localStorage.getItem('lifeos.state.prev'));
ok('перед сменой формата отложен снимок', prev === MINE);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(700);
ok('его можно скачать из настроек', await p.locator('[data-act="prev"]').count() === 1);
// повторная загрузка того же формата снимок не перетирает пустым
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(700);
ok('на своём формате снимок не переписывается',
   (await p.evaluate(() => localStorage.getItem('lifeos.state.prev'))) === MINE);

console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'ВСЁ ПРОШЛО');
await b.close();
process.exit(bad ? 1 : 0);
