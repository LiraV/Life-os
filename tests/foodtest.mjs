import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|401/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

// перехватываем OpenAI: настоящий ключ для теста не нужен
let lastRequest = null;
await ctx.route('https://api.openai.com/**', async route => {
  const req = route.request();
  lastRequest = { url: req.url(), auth: (req.headers()['authorization'] || '').slice(0, 12), body: req.postDataJSON?.() };
  if (req.url().endsWith('/models')) {
    return route.fulfill({ json: { data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] } });
  }
  return route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({
    title: 'Овсянка с бананом', kcal: 420, prot: 12, fat: 9, carb: 74,
    portion: 'тарелка ~350 г', confidence: 'medium', note: 'каша, банан, немного мёда',
  }) } }] } });
});

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

// 1. без ключа фото просит настройки
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(500);
await p.getByText('Определить по фото').click(); await p.waitForTimeout(400);
console.log('1) без ключа:', await p.locator('.sheet-title').innerText());
await p.locator('[data-sheet="close"]').click(); await p.waitForTimeout(300);

// 2. ручной приём пищи и вода
await p.locator('[data-act="add"][data-m="lunch"]').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Творог');
await p.fill('input[name="kcal"]', '180');
await p.fill('input[name="prot"]', '25');
await p.fill('input[name="fat"]', '5');
await p.fill('input[name="carb"]', '8');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
await p.locator('[data-act="water"][data-v="250"]').click(); await p.waitForTimeout(200);
await p.locator('[data-act="water"][data-v="500"]').click(); await p.waitForTimeout(300);
let st = await state();
const today = Object.keys(st.food.days)[0];
console.log('2) день:', JSON.stringify({ вода: st.food.days[today].water, приёмов: st.food.days[today].entries.length }));
console.log('   сводка:', (await p.locator('.card', { hasText: 'Калории' }).innerText()).replace(/\n+/g, ' | '));

// 3. ключ в настройках
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);
await p.getByText('Добавить ключ OpenAI').click(); await p.waitForTimeout(350);
await p.fill('input[name="key"]', 'sk-test-1234567890abcdefghijklmnop');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
console.log('3) в настройках:', (await p.locator('.card', { hasText: 'ИИ · OpenAI' }).innerText()).replace(/\n+/g, ' | ').slice(0, 120));
st = await state();
console.log('   ключ НЕ попал в состояние приложения:', !JSON.stringify(st).includes('sk-test'));
console.log('   ключ лежит отдельно:', await p.evaluate(() => !!localStorage.getItem('lifeos.openai.key')));
await p.getByText('Проверить ключ').click(); await p.waitForTimeout(600);
console.log('   проверка:', await p.locator('.toast').innerText().catch(() => '—'));

// 4. фото → КБЖУ
await p.evaluate(() => { location.hash = '#/food'; }); await p.waitForTimeout(500);
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.getByText('Определить по фото').click()]);
await chooser.setFiles({ name: 'meal.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR4nGP8//8/AzbAxIAHjEoyAgCVUQMSDS7lNwAAAABJRU5ErkJggg==', 'base64') });
await p.waitForTimeout(1500);
console.log('4) шторка после фото:', await p.locator('.sheet-title').innerText(), '|', await p.locator('.sheet-sub').innerText());
console.log('   подставлено:', await p.locator('input[name="title"]').inputValue(), '|',
  await p.locator('input[name="kcal"]').inputValue(), 'ккал | Б', await p.locator('input[name="prot"]').inputValue());
console.log('   запрос ушёл с ключом:', lastRequest.auth, '| модель:', lastRequest.body?.model, '| картинка вложена:',
  JSON.stringify(lastRequest.body?.messages?.[1]?.content?.[1]?.type));
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
st = await state();
console.log('   записано приёмов:', st.food.days[today].entries.length, '| фото в хранилище не осело:', !JSON.stringify(st).includes('data:image'));
console.log('   калорий за день:', (await p.locator('.card', { hasText: 'Калории' }).innerText()).match(/\d+ \/ \d+/)?.[0]);
await p.screenshot({ path: 'food.png' });

// 5. вопрос Летописцу
await ctx.route('https://api.openai.com/v1/chat/completions', route => route.fulfill({
  json: { choices: [{ message: { content: 'Начни с зала — он уже стоит в плане, а энергия у тебя к вечеру растёт.' } }] } }));
await p.evaluate(() => { location.hash = '#/inside/chat'; }); await p.waitForTimeout(600);
await p.fill('[data-field="ask"]', 'с чего начать сегодня?');
await p.locator('.btn', { hasText: 'Отправить' }).click(); await p.waitForTimeout(1200);
const chat = await p.locator('.ai').last().innerText();
console.log('5) ответ Летописца:', chat.slice(0, 70));
console.log('   в контекст ушли данные, но не дневник:', !JSON.stringify(lastRequest.body).includes('дневник'));

// 6. ошибка API показывается человеку
await ctx.route('https://api.openai.com/v1/chat/completions', route =>
  route.fulfill({ status: 401, json: { error: { message: 'Incorrect API key' } } }));
await p.fill('[data-field="ask"]', 'а если ключ неверный?');
await p.locator('.btn', { hasText: 'Отправить' }).click(); await p.waitForTimeout(1200);
console.log('6) при неверном ключе:', (await p.locator('.ai').last().innerText()).slice(0, 80));
console.log('ошибки:', errs.length ? errs : 'нет');
await b.close();
