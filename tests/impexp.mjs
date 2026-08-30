import { chromium, devices } from './pw.mjs';
import fs from 'fs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU', acceptDownloads: true });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const bud = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).budget);
const DIR = '/tmp/claude-0/-home-user-Life-os/41088404-d7d2-525c-94a8-f20fc604e441/scratchpad/';

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(400);

// Предложение про подсказки в тестах не участвует. Гасим его через состояние,
// а не кликом: так не ждём анимацию шторки и не зависим от её появления.
await p.evaluate(async () => {
  try {
    const { update } = await import('./app/js/store.js');
    const { closeSheet } = await import('./app/js/ui.js');
    update(s => { s.ui.tips = 'off'; });
    closeSheet();
    // Сохранение в приложении отложенное, а тесты правят хранилище сразу —
    // поэтому дублируем запись, чтобы отказ не потерялся при перезагрузке.
    const raw = localStorage.getItem('lifeos.state');
    if (raw) {
      const cur = JSON.parse(raw);
      (cur.ui ||= {}).tips = 'off';
      localStorage.setItem('lifeos.state', JSON.stringify(cur));
    }
  } catch { /* страница без приложения — гасить нечего */ }
});
await p.evaluate(() => { location.hash = '#/budget'; }); await p.waitForTimeout(600);

// наполняем и выгружаем
await p.locator('[data-act="tab"][data-v="ops"]').click(); await p.waitForTimeout(350);
for (const [k, sum, cat, note] of [['income','200000','От отца','аванс'], ['expense','6630','Еда','GROWFOOD'], ['expense','2800','Транспорт','Метро']]) {
  await p.locator(`[data-act="opadd"][data-k="${k}"]`).click(); await p.waitForTimeout(350);
  await p.fill('input[name="sum"]', sum);
  await p.selectOption('select[name="catId"]', await p.locator('select[name="catId"]').evaluate((e,c)=>[...e.options].find(o=>o.text===c).value, cat));
  await p.fill('input[name="note"]', note);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(400);
}
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(350);
const dl = await Promise.all([p.waitForEvent('download'), p.getByText('Выгрузить в Excel').click()]).then(r => r[0]);
const file = DIR + dl.suggestedFilename();
await dl.saveAs(file);
console.log('1) выгрузка бюджета:', dl.suggestedFilename(), fs.statSync(file).size, 'байт');

// стираем всё и загружаем обратно
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.budget.ops = []; s.budget.plans = {};
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/budget'; }); await p.waitForTimeout(500);
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(350);
let chooser = p.waitForEvent('filechooser');
await p.getByText('Загрузить из Excel').click();
(await chooser).setFiles(file);
await p.waitForTimeout(1800);
console.log('2) обратная загрузка:', await p.locator('.toast').innerText().catch(() => '—'));
let s2 = await bud();
console.log('   операций:', s2.ops.length, '| суммы:', s2.ops.map(o => `${o.kind}:${o.sum}`).join(', '));

// повторная загрузка того же файла не должна дублировать
chooser = p.waitForEvent('filechooser');
await p.getByText('Загрузить из Excel').click();
(await chooser).setFiles(file);
await p.waitForTimeout(1800);
console.log('3) повторная загрузка:', await p.locator('.toast').innerText().catch(() => '—'));
console.log('   операций осталось:', (await bud()).ops.length);

// её настоящий планировщик
chooser = p.waitForEvent('filechooser');
await p.getByText('Загрузить из Excel').click();
(await chooser).setFiles('/root/.claude/uploads/41088404-d7d2-525c-94a8-f20fc604e441/a682bc5d-____________2026.xlsx');
await p.waitForTimeout(2500);
console.log('4) её планировщик:', await p.locator('.toast').innerText().catch(() => '—'));
s2 = await bud();
const plan = s2.plans['2026-03']?.expense || {};
const named = Object.entries(plan).map(([id, v]) => `${(s2.cats.expense.find(c => c.id === id) || {}).name}: ${v}`);
console.log('   план на март:', named.join(', ').slice(0, 160));
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
await p.locator('[data-act="prev"]').click(); await p.waitForTimeout(300);
for (let i = 0; i < 4; i++) { await p.locator('[data-act="prev"]').click(); await p.waitForTimeout(200); }
console.log('   на экране марта:', (await p.locator('.card', { hasText: 'ИТОГ МЕСЯЦА' }).innerText()).replace(/\n+/g, ' | ').slice(0, 110));
await p.screenshot({ path: 'budget-import.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
