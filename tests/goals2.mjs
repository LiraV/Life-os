import { chromium } from './pw.mjs';
const b = await chromium.launch();

// ── A. миграция целей из v2 ──
{
  const ctx = await b.newContext({ serviceWorkers: 'block',  viewport: { width: 400, height: 900 }, locale: 'ru-RU' });
  await ctx.addInitScript(() => {
    if (localStorage.getItem('seeded') === '1') return;
    localStorage.setItem('seeded', '1');
    const t = new Date().toISOString().slice(0, 7);
    localStorage.setItem('lifeos.state', JSON.stringify({
      v: 2, onboarded: true,
      user: { name: 'Лера', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55, traits: [], xp: 40, createdAt: '2026-01-01' },
      quests: {}, energy: {},
      goals: [
        { id: 'g1', title: 'Сдать главу 2', month: t, steps: [{ id: 's1', title: 'План', done: true }, { id: 's2', title: 'Текст', done: false }], sphere: 'edu', deadline: '', progress: 0 },
        { id: 'g2', title: 'Старая цель', month: '2026-05', steps: [], sphere: '', progress: 40 },
      ],
      weeks: {}, years: { 2026: { theme: 'Свой голос', quarters: {} } }, spheres: {}, habits: [],
      health: { days: {}, measures: [], symptoms: [] }, diary: [], chat: [], tests: {}, ui: {},
    }));
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' });
  await p.waitForTimeout(900);
  await p.locator('[data-sheet="secondary"]').click({ timeout: 2500 }).catch(() => {});
  await p.waitForTimeout(300);
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
  console.log('A) версия:', st.v, '| цели:', JSON.stringify(st.goals.map(g => ({ t: g.title, h: g.horizon, p: g.period, m: g.month }))));
  await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(400);
  console.log('   месяц:', (await p.locator('.scr').innerText()).split('\n').filter(l => /Сдать главу|%/.test(l)).join(' | '));
  await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(400);
  console.log('   год:', (await p.locator('.scr').innerText()).split('\n').filter(l => /Q[1-4]|Цели месяцев|%/.test(l)).slice(0, 6).join(' | '));
  console.log('   ошибки:', errs.length ? errs : 'нет');
  await ctx.close();
}

// ── B. экранирование в названиях ──
{
  const ctx = await b.newContext({ viewport: { width: 400, height: 900 }, locale: 'ru-RU' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(600);
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
  await p.goto('http://127.0.0.1:8765/#/plans', { waitUntil: 'load' }); await p.waitForTimeout(400);
  await p.locator('[data-act="tab"][data-v="year"]').click(); await p.waitForTimeout(300);
  const nasty = '<img src=x onerror=alert(1)> "кавычки" & <b>жир</b>';
  await p.getByText('+ Цель года').click(); await p.waitForTimeout(300);
  await p.fill('input[name="title"]', nasty);
  await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
  const shown = await p.locator('.card', { hasText: 'кавычки' }).innerText();
  console.log('B) заголовок отрисован как текст:', JSON.stringify(shown.split('\n')[0]));
  console.log('   инъекции нет:', (await p.locator('#scr img').count()) === 0 && (await p.locator('#scr b').count()) === 0);
  // и в динамическом списке «ведёт к»
  await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(300);
  await p.getByText('+ Цель месяца').click(); await p.waitForTimeout(300);
  await p.locator('.opts[data-name="horizon"] .opt', { hasText: 'Квартал' }).click(); await p.waitForTimeout(300);
  const optText = await p.locator('select[name="parentId"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
  console.log('   в пересобранном списке:', JSON.stringify(optText.slice(0, 70)));
  console.log('   инъекции в шторке нет:', (await p.locator('.sheet img').count()) === 0);
  console.log('   ошибки:', errs.length ? errs : 'нет');
  await ctx.close();
}
await b.close();
