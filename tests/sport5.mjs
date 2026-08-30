import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

// состояние прошлой версии: виды тренировок и цель, считавшаяся из упражнения
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  const t = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 16, onboarded: true,
    user: { name: 'Лера', chronotype: 'сова', sleep: 10, introversion: 55, activity: 55, traits: [], xp: 40, createdAt: '2026-01-01' },
    quests: {}, energy: {}, weeks: {}, years: {}, spheres: {}, intentions: {}, habits: [], lessons: [], diary: [], chat: [], tests: {}, ui: {},
    goals: [{ id: 'G1', title: 'Подтянуться 1 раз', horizon: 'month', period: t.slice(0,7), dynamic: true,
      target: 1, unit: 'раз', current: 0, exerciseId: 'X1', steps: [], slots: [], parentId: '' }],
    sport: {
      exercises: [{ id: 'X1', name: 'Турник', unit: 'раз', dir: 'up' }],
      kinds: [{ id: 'gym', name: 'Зал сама', sets: [] }, { id: 'K1', name: 'Зал А · ноги', sets: [{ id: 'S1', exerciseId: 'X1', value: 5, reps: 3 }] }],
      workouts: [{ id: 'W1', date: t, kind: 'K1', title: '', done: true, sets: [{ id: 'S9', exerciseId: 'X1', value: 1, reps: 1 }] }],
    },
    study: { places: [], subjects: [], tasks: [] },
    budget: { cats: { expense: [], income: [] }, plans: {}, ops: [], vaults: [], rules: [], start: 0 },
    food: { targets: {}, days: {} }, health: { days: {}, measures: [], symptoms: [] },
    tracker: { rows: [], values: {}, habitValues: {}, lessonValues: {}, exerciseValues: {} },
  }));
});

await p.goto('http://127.0.0.1:8765/#/sport', { waitUntil: 'load' });
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
let s = await st();
console.log('1) версия:', s.v);
console.log('   шаблоны:', s.sport.templates.map(t => `${t.name} (${t.sets.length} упр.)`).join(', '), '(пустые стандартные виды не перенесены)');
console.log('   тренировка получила название:', JSON.stringify(s.sport.workouts[0].title), '| kind убран:', s.sport.workouts[0].kind === undefined);
console.log('   автоматика цели снята:', s.goals[0].exerciseId === undefined);
console.log('2) вкладки спорта:', await p.locator('.pills .pill').allInnerTexts());
console.log('   дат на экране нет:', !/\d{1,2}\s(январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.test(await p.locator('.scr').innerText()));
console.log('   шаблон на экране:', (await p.locator('.card', { hasText: 'Зал А' }).innerText()).replace(/\n+/g, ' | '));

// цель считается вручную и не закрывается сама
await p.evaluate(() => { location.hash = '#/plans'; }); await p.waitForTimeout(600);
await p.locator('[data-act="tab"][data-v="month"]').click(); await p.waitForTimeout(450);
const row = await p.locator('.dyn-row', { hasText: 'Подтянуться' }).innerText();
console.log('3) цель:', row.replace(/\n+/g, ' | '), '| кнопки ручные:', await p.locator('.dyn-row', { hasText: 'Подтянуться' }).locator('.hab-plus').count());
await p.locator('.dyn-row', { hasText: 'Подтянуться' }).locator('[data-d="1"]').click(); await p.waitForTimeout(450);
console.log('   после плюса:', (await p.locator('.dyn-row', { hasText: 'Подтянуться' }).innerText()).replace(/\n+/g, ' | '));

// тренировка на дне из шаблона + подпись цели
await p.evaluate(() => { location.hash = '#/day'; }); await p.waitForTimeout(600);
await p.getByText('+ тренировка').click(); await p.waitForTimeout(500);
const tplOpts = await p.locator('select[name="templateId"]').evaluate(e => [...e.options].map(o => o.text).join(' | '));
console.log('4) выбор шаблона на дне:', tplOpts);
await p.selectOption('select[name="templateId"]', await p.locator('select[name="templateId"]').evaluate(e => [...e.options].find(o => o.text.includes('Зал А')).value));
await p.selectOption('select[name="goalId"]', await p.locator('select[name="goalId"]').evaluate(e => [...e.options].find(o => o.text.includes('Подтянуться')).value));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(650);
s = await st();
const w = s.sport.workouts.find(x => x.id !== 'W1');
console.log('5) состав из шаблона:', w.sets.map(x => `${x.reps}×${x.value}`).join(', '), '| название:', w.title);
console.log('   строка на дне:', (await p.locator('.quest', { hasText: 'Подтянуться' }).innerText()).replace(/\n+/g, ' | '));

// отметка не двигает цель
const before = (await st()).goals[0].current;
await p.locator('.quest', { hasText: 'Подтянуться' }).locator('[data-act="wdone"]').click(); await p.waitForTimeout(900);
if (await p.locator('[data-sheet="secondary"]').count()) { await p.locator('[data-sheet="secondary"]').click(); await p.waitForTimeout(400); }
console.log('6) цель после отметки:', (await st()).goals[0].current, '(было', before + ') — автоматики нет');
await p.evaluate(() => { location.hash = '#/sport'; }); await p.waitForTimeout(500);
await p.screenshot({ path: 'sport-tpl.png' });
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
