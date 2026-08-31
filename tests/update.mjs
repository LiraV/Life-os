// Приложение должно само сказать, что вышла новая версия. Вкладка, открытая
// давно, работает на старом коде, и человек честно не понимает, почему
// обещанное не появилось — так и случилось.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };

async function open(serverBuild) {
  const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  if (serverBuild) {
    // Снаружи лежит другая сборка: подменяем только запрос «а что там сейчас»,
    // с меткой времени в адресе, — сам модуль версии страница берёт как обычно.
    await ctx.route(/app\/js\/version\.js\?v=/, route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `export const BUILD = '${serverBuild}';\n`,
    }));
  }
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
  await p.waitForTimeout(800);
  return { ctx, p };
}

// ── снаружи та же сборка: тревожить незачем ─────────────────────
{
  const { ctx, p } = await open(null);
  await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(3500);
  const t = await p.locator('#scr').innerText();
  ok('на свежей сборке сказано, что она свежая', /Это самая свежая/i.test(t),
    (t.match(/Сборка[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' · '));
  ok('и никакой тревоги нет', !/Вышла новая/i.test(t));
  await ctx.close();
}

// ── снаружи новее: сказать вслух ────────────────────────────────
{
  const { ctx, p } = await open('2999.12.31-999');
  await p.evaluate(() => { location.hash = '#/settings'; });
  await p.waitForFunction(() => /Вышла новая/i.test(document.getElementById('scr').innerText),
    null, { timeout: 15000 }).catch(() => {});
  const t = await p.locator('#scr').innerText();
  ok('о новой версии сказано в настройках', /Вышла новая: 2999\.12\.31-999/.test(t),
    (t.match(/Вышла новая[\s\S]{0,30}/) || [''])[0]);
  ok('и кнопка обновления рядом', await p.locator('[data-act="refresh"]').count() === 1);
  await ctx.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ про новую версию приложение говорит само');
process.exit(bad ? 1 : 0);
