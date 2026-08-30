import { chromium, devices } from './pw.mjs';
import fs from 'fs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU', acceptDownloads: true });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());

// состояние предыдущей версии: правки хранились парой «сколько раз / полных дней»
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const y = new Date().getFullYear();
  const log = {};
  for (let d = 1; d <= 10; d++) log[`${y}-07-${String(d).padStart(2,'0')}`] = 3;   // 10 полных дней
  for (let d = 11; d <= 14; d++) log[`${y}-07-${String(d).padStart(2,'0')}`] = 1;  // норма не закрыта
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 6, onboarded: true,
    user: { name: 'Лера', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55, traits: [], xp: 40, createdAt: '2026-01-01' },
    quests: {}, energy: {}, goals: [], weeks: {}, years: {}, spheres: {}, intentions: {},
    habits: [{ id: 'p', name: 'Таблетки', target: 3, step: 1, unit: 'приёма', log }],
    tracker: { rows: [{ id: 'r1', name: 'Шпагат', unit: 'ч' }], values: { r1: { [`${y}-01`]: 8 } },
      habitValues: { p: { [`${y}-01`]: { total: 45 }, [`${y}-02`]: { days: 12, total: 36 } } } },
    health: { days: {}, measures: [], symptoms: [] }, diary: [], chat: [], tests: {}, ui: {},
  }));
});

const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push(m.text()); });
await p.goto('http://127.0.0.1:8765/#/tracker', { waitUntil: 'load' });
await p.waitForTimeout(900);

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

const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
console.log('1) версия:', st.v, '| правки после миграции:', JSON.stringify(st.tracker.habitValues));
console.log('   45 приёмов при норме 3 → 15 полных дней:', st.tracker.habitValues.p[Object.keys(st.tracker.habitValues.p)[0]] === 15);

console.log('2) переключателя режимов нет:', await p.locator('[data-act="mode"]').count() === 0);
console.log('   подзаголовок:', await p.locator('.stepper .lab').innerText());
const row = p.locator('.tr tbody tr', { hasText: 'Таблетки' });
console.log('   строка:', (await row.innerText()).replace(/\s+/g, ' '));
console.log('   (янв 15 правка, фев 12 правка, июл 10 — только дни с закрытой нормой из 14 отмеченных)');

// правка ячейки
await row.locator('td.edit').nth(6).click(); await p.waitForTimeout(400);   // июль
console.log('3) шторка:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
console.log('   поле:', await p.locator('.fld span').first().innerText(), '| max:', await p.locator('input[name="n"]').getAttribute('max'));
await p.fill('input[name="n"]', '20');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('   после правки:', (await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).innerText()).replace(/\s+/g, ' '));
await row.locator('td.edit').nth(6).click(); await p.waitForTimeout(400);
await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(500);
console.log('   вернули расчёт:', (await p.locator('.tr tbody tr', { hasText: 'Таблетки' }).innerText()).replace(/\s+/g, ' '));

// выгрузка
const dl = await Promise.all([p.waitForEvent('download'), p.getByText('Выгрузить в Excel').click()]).then(r => r[0]);
const file = '/tmp/claude-0/-home-user-Life-os/41088404-d7d2-525c-94a8-f20fc604e441/scratchpad/' + dl.suggestedFilename();
await dl.saveAs(file);
console.log('4) выгрузка:', dl.suggestedFilename(), fs.statSync(file).size, 'байт');
await p.screenshot({ path: 'tracker-days.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
