// Беседа с Летописцем: нить помнит себя, дневник уходит только по галочке.
// Запросы к OpenAI перехватываем — ключа тут нет, да и не нужен.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block',  ...devices['iPhone 13'], locale: 'ru-RU' });
// Шрифты Google из песочницы недоступны: запрос висит до таймаута и держит
// загрузку страницы примерно 13 секунд. Обрываем — на проверки они не влияют.
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
await ctx.addInitScript(() => { localStorage.setItem('lifeos.openai.key', 'sk-' + 'x'.repeat(40)); });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const sent = [];
await p.route('**://api.openai.com/**', async route => {
  const body = JSON.parse(route.request().postData() || '{}');
  sent.push(body);
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ choices: [{ message: { content: `Ответ №${sent.length}. Расскажи, что было тяжелее всего?` } }] }),
  });
});
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(1200);
await p.locator('[data-sheet="secondary"]').click({ timeout: 2500 }).catch(() => {});
await p.waitForTimeout(300);

// заводим немного данных, чтобы выжимке было что рассказать
await p.getByText('+ Добавить квест').click(); await p.waitForTimeout(400);
await p.fill('input[name="title"]', 'Дописать главу');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/inside/diary'; }); await p.waitForTimeout(600);
await p.locator('[data-act="entry"]').click(); await p.waitForTimeout(400);
await p.fill('textarea[name="text"]', 'Секретная запись про важное');
await p.locator('[data-sheet="save"]').click(); await p.waitForTimeout(500);

await p.evaluate(() => { location.hash = '#/inside/chat'; }); await p.waitForTimeout(600);
console.log('1) начала разговора:', (await p.locator('.pills .pill').allInnerTexts()).join(' | '));

// первый ход
await p.locator('.pill', { hasText: 'Я вымоталась' }).click(); await p.waitForTimeout(900);
let msgs = await p.locator('.ai, .me').allInnerTexts();
console.log('2) после первого хода:', msgs.slice(-2).map(t => t.slice(0, 40)).join(' → '));
const first = sent[0];
console.log('   ролей в запросе:', first.messages.map(m => m.role).join(','));
console.log('   выжимка содержит квест:', /Дописать главу/.test(first.messages[1].content));
console.log('   дневник по умолчанию не ушёл:', !/Секретная запись/.test(JSON.stringify(first)));

// второй ход — нить должна помнить первый
await p.fill('[data-field="ask"]', 'Больше всего давит учёба');
await p.locator('.btn', { hasText: 'Отправить' }).click(); await p.waitForTimeout(900);
const second = sent[1];
const thread = second.messages.filter(m => m.role !== 'system');
console.log('3) нить во втором запросе:', thread.length, 'сообщений ·', thread.map(m => `${m.role}: ${m.content.slice(0, 22)}`).join(' | '));

// дневник — только по галочке
await p.locator('[data-change="withdiary"]').check(); await p.waitForTimeout(500);
await p.fill('[data-field="ask"]', 'А что скажешь про мои записи?');
await p.locator('.btn', { hasText: 'Отправить' }).click(); await p.waitForTimeout(900);
console.log('4) с галочкой дневник ушёл:', /Секретная запись/.test(JSON.stringify(sent[2])));
console.log('   в состоянии галочка запомнилась:', (await st()).ui.chatDiary === true);

// ошибка сети показывается, а не молчит
await p.unroute('**://api.openai.com/**');
await p.route('**://api.openai.com/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"message":"сервер прилёг"}}' }));
await p.fill('[data-field="ask"]', 'ещё разок');
await p.locator('.btn', { hasText: 'Отправить' }).click(); await p.waitForTimeout(1000);
msgs = await p.locator('.ai').allInnerTexts();
console.log('5) ошибка видна:', msgs[msgs.length - 1].slice(0, 60), '| «думаю» не залипло:', (await st()).ui.chatBusy === false);

// очистка
await p.locator('.pill', { hasText: 'очистить' }).click(); await p.waitForTimeout(600);
console.log('6) после очистки сообщений:', (await st()).chat.length, '| на экране приветствие:', (await p.locator('.ai').first().innerText()).slice(0, 30));
// длинная переписка: экран должен открываться снизу
await p.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('lifeos.state'));
  st.chat = Array.from({ length: 24 }, (_, i) => ({ id: 'm' + i, who: i % 2 ? 'ai' : 'me', text: `Сообщение ${i + 1} — довольно длинное, чтобы переписка точно не влезла в экран целиком.`, ts: Date.now() }));
  localStorage.setItem('lifeos.state', JSON.stringify(st));
});
// Перезагружаемся сразу: любое действие в приложении перезапишет наш посев.
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#/inside/chat'; }); await p.waitForTimeout(900);
const pos = await p.evaluate(() => {
  const scr = document.querySelector('.scr');
  const box = document.querySelector('[data-field="ask"]').getBoundingClientRect();
  const view = scr.getBoundingClientRect();
  return { top: Math.round(scr.scrollTop), max: Math.round(scr.scrollHeight - scr.clientHeight),
    inputVisible: box.top >= view.top && box.bottom <= view.bottom + 1 };
});
console.log('7) открылось снизу:', pos.top, 'из', pos.max, '| поле ввода видно:', pos.inputVisible);
const lastSeen = await p.evaluate(() => {
  const scr = document.querySelector('.scr').getBoundingClientRect();
  const msgs = [...document.querySelectorAll('.ai, .me')];
  const last = msgs[msgs.length - 1].getBoundingClientRect();
  return last.bottom <= scr.bottom + 1 && last.top >= scr.top - 1;
});
console.log('   последнее сообщение видно:', lastSeen);

// вкладка «Тесты» вниз не прыгает
await p.evaluate(() => { location.hash = '#/inside/tests'; }); await p.waitForTimeout(700);
console.log('8) на «Тестах» осталось сверху:', await p.evaluate(() => document.querySelector('.scr').scrollTop) === 0);

console.log('ошибки:', errs.length ? errs : 'нет');
await p.evaluate(() => { location.hash = '#/inside/chat'; }); await p.waitForTimeout(800);
await p.screenshot({ path: 'chat.png' });
await b.close();
