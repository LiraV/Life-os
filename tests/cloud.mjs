// Облако: вход через Яндекс ID, слияние при первом входе, выход. Сервер поддельный — нам нужны
// не чужие ответы, а собственное поведение: что приложение делает с данными.
//
// Главное, что проверяется: записанное до входа не умирает.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };

// Токен Яндекса — обычная строка: кто его хозяин, знает только функция.
const TOKEN = 'y0_AgAAAAAtestTOKEN';

async function open(cloudRow) {
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const server = { row: cloudRow, pushed: [] };
  // Поддельный шлюз: та же договорённость, что и у настоящей функции.
  const ACCOUNT = { id: '42', login: 'lera', email: 'lera@yandex.ru' };
  await ctx.route('**/state', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ account: ACCOUNT, data: server.row }) });
    }
    const body = JSON.parse(route.request().postData() || '{}');
    server.pushed.push(body);
    server.row = body;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  // Настройки облака подставляем до загрузки модулей.
  await p.route('**/app/js/cloud-config.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "export const CLOUD = { api: 'https://фейк.apigw.yandexcloud.net', clientId: 'test' };\nexport const cloudReady = () => true;\n",
  }));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  return { ctx, p, server };
}
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const enter = async p => {
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
  // Предложение про подсказки перекрывает экран и ловит чужие нажатия.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lifeos.state'));
    s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
};

// ── 1. без входа приложение живёт как жило ───────────────────────
{
  const { ctx, p } = await open(null);
  await enter(p);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
  const txt = await p.locator('#scr').innerText();
  ok('в настройках есть вход через Яндекс', /Войти через Яндекс/i.test(txt));
  ok('и обещание, что записанное не денется', /не заменится|не денется/i.test(txt));
  await ctx.close();
}

// ── 2. первый вход: местное сливается с облачным, а не уступает ──
{
  const { ctx, p, server } = await open(null);
  await enter(p);
  // что уже записано в браузере до входа
  await p.evaluate(async () => {
    const { update, uid } = await import('/app/js/store.js');
    update(s => {
      s.goals.push({ id: 'своя', title: 'Цель до входа', horizon: 'month', period: '2026-08', target: 3, current: 1, steps: [], slots: [] });
      s.sleep['2026-08-29'] = 7.5;
    });
  });
  await p.waitForTimeout(300);
  // облако уже что-то знает — с другого устройства
  server.row = (() => {
    const T = '2026-08-30T09:00:00.000Z';
    return {
      v: 52, onboarded: true, user: { name: 'Лера', xp: 200 },
      goals: [{ id: 'чужая', title: 'Цель с ноутбука', horizon: 'month', period: '2026-08', target: 5, current: 2, steps: [], slots: [], order: 0, createdAt: T, updatedAt: T }],
      sleep: { '2026-08-28': 8 }, touched: { 'sleep.2026-08-28': T }, deleted: [], changedAt: T,
    };
  })();
  // возврат от Google
  await p.goto(`http://127.0.0.1:8765/#access_token=${TOKEN}&token_type=bearer&expires_in=31536000`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  const s = await st(p);
  const titles = s.goals.map(g => g.title).sort();
  ok('цель, записанная до входа, на месте', titles.includes('Цель до входа'), titles.join(' | '));
  ok('цель с другого устройства приехала', titles.includes('Цель с ноутбука'), titles.join(' | '));
  ok('отметка сна до входа не потерялась', s.sleep['2026-08-29'] === 7.5, JSON.stringify(s.sleep));
  ok('и чужая отметка сна тоже', s.sleep['2026-08-28'] === 8, JSON.stringify(s.sleep));
  ok('в облако ушло общее, а не одна из сторон',
    server.pushed.length > 0 && server.pushed.at(-1).goals.length === 2, String(server.pushed.at(-1)?.goals?.length));
  ok('токен убран из адресной строки', !(await p.evaluate(() => location.hash)).includes('access_token'),
    await p.evaluate(() => location.hash));

  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
  ok('в настройках видно, кто вошёл', /lera@yandex\.ru/.test(await p.locator('#scr').innerText()));
  await ctx.close();
}

// ── 3. выход не трогает записи на устройстве ─────────────────────
{
  const { ctx, p } = await open(null);
  await enter(p);
  await p.evaluate(async () => {
    const { update, uid } = await import('/app/js/store.js');
    update(s => { s.goals.push({ id: 'g9', title: 'Останется', horizon: 'month', period: '2026-08', target: 1, current: 0, steps: [], slots: [] }); });
  });
  await p.goto(`http://127.0.0.1:8765/#access_token=${TOKEN}&token_type=bearer&expires_in=31536000`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
  await p.locator('[data-act="signout"]').click(); await p.waitForTimeout(300);
  await p.locator('.sheet [data-sheet="danger"], .sheet .btn').first().click().catch(() => {});
  await p.waitForTimeout(600);
  const s = await st(p);
  ok('после выхода цель на устройстве осталась', s.goals.some(g => g.title === 'Останется'), String(s.goals.length));
  await ctx.close();
}

// ── 4. облако молчит — данные целы ───────────────────────────────
{
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('**/state', route => route.fulfill({ status: 500, body: 'нет' }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.route('**/app/js/cloud-config.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "export const CLOUD = { api: 'https://фейк.apigw.yandexcloud.net', clientId: 'test' };\nexport const cloudReady = () => true;\n",
  }));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' }); await p.waitForTimeout(700);
  await enter(p);
  await p.evaluate(async () => {
    const { update } = await import('/app/js/store.js');
    update(s => { s.goals.push({ id: 'g8', title: 'Цель при сбое', horizon: 'month', period: '2026-08', target: 1, current: 0, steps: [], slots: [] }); });
  });
  await p.goto(`http://127.0.0.1:8765/#access_token=${TOKEN}&token_type=bearer&expires_in=31536000`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const s = await st(p);
  ok('сбой облака не тронул данные', s.goals.some(g => g.title === 'Цель при сбое'), String(s.goals.length));
  ok('и приложение открылось', !(await p.locator('#scr').innerText()).includes('Экран не открылся'));
  await ctx.close();
}

// ── 5. адрес возврата один и тот же, как ни открой приложение ────
{
  const { ctx, p } = await open(null);
  const fromBrowser = await p.evaluate(async () => (await import('/app/js/cloud.js')).redirectUri());
  await p.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const fromHome = await p.evaluate(async () => (await import('/app/js/cloud.js')).redirectUri());
  ok('адрес возврата не зависит от того, как открыто приложение', fromBrowser === fromHome,
    `${fromBrowser} vs ${fromHome}`);
  ok('и заканчивается косой чертой, как записано у Яндекса', fromBrowser.endsWith('/'), fromBrowser);
  await ctx.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ облако не съедает то, что было');
process.exit(bad ? 1 : 0);
