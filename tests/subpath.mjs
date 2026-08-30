import { chromium } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('response', r => { if (r.status() >= 400 && new URL(r.url()).hostname === '127.0.0.1') errs.push(r.status() + ' ' + new URL(r.url()).pathname); });
const BASE = 'http://127.0.0.1:8766/Life-os/';
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click();

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
await p.waitForTimeout(400);

// манифест и SW под подкаталогом
const sw = await p.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return r ? { scope: r.scope, active: !!(r.active || r.installing || r.waiting) } : null;
});
const man = await p.evaluate(async () => {
  const href = document.querySelector('link[rel=manifest]').href;
  const j = await (await fetch(href)).json();
  return { href, start: new URL(j.start_url, href).pathname, scope: new URL(j.scope, href).pathname, icon: new URL(j.icons[0].src, href).pathname };
});
console.log('SW:', JSON.stringify(sw));
console.log('манифест:', JSON.stringify(man));
const iconOk = await p.evaluate(async u => (await fetch(u)).ok, 'http://127.0.0.1:8766' + man.icon);
console.log('иконка из манифеста доступна:', iconOk);

// хеш-роутинг под подкаталогом
for (const r of ['plans', 'spheres', 'habits', 'health', 'inside/tests', 'me', 'settings']) {
  await p.goto(BASE + '#/' + r, { waitUntil: 'load' });
  await p.waitForTimeout(350);
  const t = await p.locator('.scr').innerText();
  console.log(('#/' + r).padEnd(16), t.length > 25 ? 'ok · ' + t.split('\n')[0].slice(0, 34) : 'ПУСТО');
}

// ссылка на дизайн-пакет из настроек
await p.goto(BASE + '#/settings', { waitUntil: 'load' });
await p.waitForTimeout(400);
const designHref = await p.locator('a[href="design/"]').getAttribute('href');
await p.locator('a[href="design/"]').click();
await p.waitForTimeout(700);
console.log('переход в дизайн-пакет:', p.url(), '| заголовок:', await p.locator('h1').innerText().catch(() => '—'));

// офлайн под подкаталогом
await p.goto(BASE, { waitUntil: 'load' });
await p.waitForTimeout(2000);
await ctx.setOffline(true);
await p.goto(BASE + '#/plans', { waitUntil: 'load' }).catch(() => {});
await p.waitForTimeout(1000);
console.log('офлайн в подкаталоге:', await p.locator('.title').first().innerText().catch(() => 'НЕ ОТКРЫЛОСЬ'));
await ctx.setOffline(false);
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
