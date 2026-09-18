// Приложение не должно мигать, а чат — утаскивать вниз, пока его читают.
// Перерисовка идёт от синхронизации, от смены минуты, от любой правки: каждая
// заменяла разметку на точно такую же и гасила весь экран.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const bump = () => p.evaluate(async () => { const { update } = await import('/app/js/store.js'); update(s => { s.user.xp += 1; }); });

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  const t = new Date().toISOString().slice(0, 10);
  s.quests[t] = [{ id: 'q1', title: 'Черновик', minutes: 45, sphere: '', done: false }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  location.hash = '#/day';
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.waitForTimeout(400);

// ── экран не пересобирается, когда нечему меняться ──────────────
// Метим узел: пересоберут разметку — метка исчезнет.
await p.evaluate(() => { document.querySelector('#scr .quest').dataset.mark = 'та-же'; });
const marked = () => p.evaluate(() => document.querySelector('#scr .quest')?.dataset.mark === 'та-же');
await p.evaluate(async () => { const { render } = await import('/app/js/main.js'); render(); });
await p.waitForTimeout(250);
ok('повторная отрисовка не трогает разметку', await marked());
// Правка, которой на этом экране не видно: запись в дневник живёт во «Внутри».
// Инбокс не годится — его счётчик как раз показан на «Дне».
await p.evaluate(async () => {
  const { updateQuiet } = await import('/app/js/store.js');
  updateQuiet(s => { s.diary.push({ id: 'd1', text: 'тихо', date: '2026-09-18', when: '', source: 'me' }); });
  const { render } = await import('/app/js/main.js'); render();
});
await p.waitForTimeout(250);
ok('и чужая правка тоже', await marked());

// А когда меняется само содержимое — разметка обновляется.
await p.evaluate(async () => {
  const { update } = await import('/app/js/store.js');
  update(s => { s.quests[new Date().toISOString().slice(0, 10)][0].title = 'Другое имя'; });
});
await p.waitForTimeout(300);
ok('настоящая правка перерисовывает', !(await marked()));
ok('и новое видно', /Другое имя/.test(await p.locator('#scr').innerText()));

// ── чат не утаскивает вниз, пока его читают ─────────────────────
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.insideTab = 'chat';
  s.chat = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, who: i % 2 ? 'ai' : 'me', text: 'Сообщение ' + i, ts: Date.now() }));
  localStorage.setItem('lifeos.state', JSON.stringify(s));
  localStorage.setItem('lifeos.openai.key', 'sk-test-0123456789012345678901234567890');
  location.hash = '#/inside';
  location.reload();
});
await p.waitForFunction(() => document.querySelectorAll('#nav button').length > 0, null, { timeout: 20000 });
await p.waitForTimeout(600);
const pos = () => p.evaluate(() => Math.round(document.getElementById('scr').scrollTop));
ok('чат открылся снизу', await p.evaluate(() => {
  const el = document.getElementById('scr');
  return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
}));

// Отлистали вверх читать — и в это время приложение обновилось.
await p.evaluate(() => { document.getElementById('scr').scrollTop = 200; });
await p.waitForTimeout(200);
const up = await pos();
await bump();
await p.waitForTimeout(400);
ok('чтение не сбивается перерисовкой', Math.abs((await pos()) - up) < 40, `${up} → ${await pos()}`);
await bump(); await bump();
await p.waitForTimeout(400);
ok('и не сбивается дальше', Math.abs((await pos()) - up) < 40, `${up} → ${await pos()}`);

// А если стоишь внизу, новое сообщение по-прежнему подтягивает вниз.
await p.evaluate(() => { const el = document.getElementById('scr'); el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(200);
await p.evaluate(async () => {
  const { update, uid } = await import('/app/js/store.js');
  update(s => { s.chat.push({ id: uid(), who: 'ai', text: 'Свежая реплика', ts: Date.now() }); });
});
await p.waitForTimeout(500);
ok('новое сообщение видно тому, кто внизу', await p.evaluate(() => {
  const el = document.getElementById('scr');
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}), String(await pos()));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ экран спокоен');
process.exit(bad ? 1 : 0);
