// Хвост migrate() должен выполняться всегда, а не только у тех, у кого
// сохранились старые «месячные»: однажды блок разорвался и весь остаток
// уехал внутрь if (Array.isArray(health.periods)).
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript(() => {
  if (localStorage.getItem('seeded') === '1') return;
  localStorage.setItem('seeded', '1');
  // Старое состояние без health.periods и без нормализованных полей.
  localStorage.setItem('lifeos.state', JSON.stringify({
    v: 2, onboarded: true,
    user: { name: 'Л', traits: ['Сова', 'Эстет достижений ✦'], xp: 0 },
    goals: [{ id: 'G1', title: 'Старая цель', month: '2026-08' }],
    habits: [{ id: 'H1', name: 'Вода', log: { '2026-08-01': true } }],
    health: { days: {} },
  }));
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(1300);

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
const s = await p.evaluate(async () => (await import('./app/js/store.js')).S);

const checks = [
  ['версия поднялась', s.v > 2],  // состояние засеяно как v2
  ['черты переведены в идентификаторы', s.user.traits.includes('owl') && s.user.traits.includes('aesthete') && s.user.traits.every(t => /^[a-z]+$/.test(t))],
  ['цель получила горизонт', s.goals[0].horizon === 'month' && Array.isArray(s.goals[0].slots)],
  ['привычка получила норму и шаг', s.habits[0].target === 1 && s.habits[0].step === 1],
  ['отметка true стала числом', s.habits[0].log['2026-08-01'] === 1],
  ['статьи бюджета заведены', s.budget.cats.expense.length > 0 && s.budget.vaults.length > 0],
  ['упражнения заведены', s.sport.exercises.length === 4],
  ['шаблоны есть массивом', Array.isArray(s.sport.templates)],
  ['трекер нормализован', !!s.tracker.exerciseValues],
  ['учёба нормализована', Array.isArray(s.study.places)],
];
checks.forEach(([n, ok]) => console.log(ok ? `  ✓ ${n}` : `  ✗ ${n}`));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
