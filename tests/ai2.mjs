// Модель выбирается списком, а не набирается руками, и список берётся у самого
// OpenAI. Плюс текст про приватность обязан говорить правду про синхронизацию.
//
// Сеть не подменяем: браузер не пустит подставной ответ чужого домена, и
// проверка мерила бы не приложение, а свои же настройки. Подменяем сам fetch —
// ровно ту границу, за которой начинается OpenAI.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

// Подставной OpenAI ставим до загрузки приложения, чтобы он был на месте всегда.
await p.addInitScript(() => {
  const real = window.fetch;
  window.fetch = (url, init) => {
    if (String(url).includes('api.openai.com/v1/models')) {
      return Promise.resolve(new Response(JSON.stringify({ data: [
        { id: 'gpt-4o-mini' }, { id: 'gpt-4o' }, { id: 'o3-mini' }, { id: 'chatgpt-4o-latest' },
        { id: 'text-embedding-3-small' }, { id: 'whisper-1' }, { id: 'dall-e-3' }, { id: 'tts-1' },
        { id: 'gpt-4o-audio-preview' },
      ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return real(url, init);
  };
});

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s));
  localStorage.setItem('lifeos.openai.key', 'sk-проверочный-ключ-достаточной-длины');
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(500);

// ── текст про данные говорит правду ─────────────────────────────
const txt = await p.locator('#scr').innerText();
ok('без входа сказано, что копии нет', /Синхронизация выключена|копии нигде нет/i.test(txt),
  (txt.match(/Синхронизация выключена.{0,40}/) || [''])[0]);
ok('обещания «без сервера и аккаунта» больше нет', !/без сервера и аккаунта/i.test(txt));
ok('сказано, что дневник и цикл не уходят', /Дневник, цикл/i.test(txt));
ok('и что ключ не уезжает ни в копию, ни в облако', /не попадает ни в копию, ни в облако/i.test(txt));

// ── список моделей приходит от OpenAI ───────────────────────────
await p.locator('[data-act="aikey"]').click(); await p.waitForTimeout(300);
ok('модель выбирается списком, а не полем ввода', await p.locator('.sheet select[name="model"]').count() === 1);
await p.waitForFunction(() => document.querySelectorAll('.sheet select[name="model"] option').length > 1, null, { timeout: 10000 })
  .catch(() => {});
const opts = await p.locator('.sheet select[name="model"] option').allTextContents();
ok('список пришёл от OpenAI', opts.includes('gpt-4o') && opts.includes('o3-mini'), opts.join(', '));
ok('неразговорчивые модели отсеяны', !opts.some(o => /whisper|dall|tts|embedding|audio/.test(o)), opts.join(', '));
ok('нынешняя модель отмечена', await p.locator('.sheet select[name="model"]').inputValue() === 'gpt-4o-mini',
  await p.locator('.sheet select[name="model"]').inputValue());

await p.selectOption('.sheet select[name="model"]', 'gpt-4o');
await p.locator('[data-sheet="save"]').click();
await p.waitForFunction(() => !document.querySelector('.overlay'), null, { timeout: 5000 }).catch(() => {});
await p.waitForTimeout(300);
ok('выбор сохранился', await p.evaluate(() => localStorage.getItem('lifeos.openai.model')) === 'gpt-4o');
// .caps в вёрстке поднимает буквы, поэтому ищем без учёта регистра.
const after = await p.locator('#scr').innerText();
ok('и виден в настройках', /Модель\s*\n?\s*gpt-4o/i.test(after), (after.match(/Модель[\s\S]{0,20}/) || [''])[0]);
ok('ключ при этом не стёрся: менялась только модель',
  await p.evaluate(() => (localStorage.getItem('lifeos.openai.key') || '').length > 20),
  await p.evaluate(() => String(localStorage.getItem('lifeos.openai.key')).slice(0, 8)));

// ── модель, которой нет в списке, не подменяется чужой ──────────
await p.evaluate(() => { localStorage.setItem('lifeos.openai.model', 'своя-особая-модель'); });
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(700);
await p.evaluate(() => { location.hash = '#/settings'; }); await p.waitForTimeout(400);
await p.locator('[data-act="aikey"]').click(); await p.waitForTimeout(500);
ok('незнакомая модель остаётся выбранной, а не подменяется',
  await p.locator('.sheet select[name="model"]').inputValue() === 'своя-особая-модель',
  await p.locator('.sheet select[name="model"]').inputValue());

// ── без входа сказано, что вход может включить ИИ сам ───────────
{
  const ctx2 = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p2 = await ctx2.newPage();
  await p2.route('**/app/js/cloud-config.js', route => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "export const CLOUD = { api: 'https://фейк.apigw.yandexcloud.net', clientId: 'test' };\nexport const cloudReady = () => true;\n",
  }));
  await p2.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p2.waitForTimeout(700);
  await p2.getByText('пропустить онбординг').click(); await p2.waitForTimeout(500);
  await p2.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
  await p2.waitForTimeout(800);
  await p2.evaluate(() => { location.hash = '#/settings'; }); await p2.waitForTimeout(500);
  const t2 = await p2.locator('#scr').innerText();
  ok('без входа сказано, что ключ может включиться сам', /включится сам после входа/i.test(t2),
    (t2.match(/.{0,30}после входа.{0,20}/) || [''])[0]);
  ok('и в синхронизации сказано, что от входа зависит ИИ', /От входа зависит и ИИ/i.test(t2));
  await ctx2.close();
}

// ── ошибку показываем настоящую, а не свою догадку ──────────────
{
  const ctx3 = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
  await ctx3.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const p3 = await ctx3.newPage();
  await p3.addInitScript(() => {
    window.fetch = (url) => {
      // Так отвечает OpenAI, когда запрос пришёл из неподдерживаемой страны:
      // права у ключа при этом любые, и дело вовсе не в модели.
      if (String(url).includes('api.openai.com')) {
        return Promise.resolve(new Response(JSON.stringify({
          error: { message: 'Country, region, or territory not supported' },
        }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
      }
      return Promise.reject(new Error('нет сети'));
    };
  });
  await p3.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
  await p3.waitForTimeout(700);
  await p3.getByText('пропустить онбординг').click(); await p3.waitForTimeout(500);
  await p3.evaluate(() => localStorage.setItem('lifeos.openai.key', 'sk-проверочный-ключ-достаточной-длины'));
  const said = await p3.evaluate(async () => {
    const ai = await import('/app/js/ai.js');
    try { await ai.checkKey(); return 'ошибки не было'; } catch (e) { return e.message; }
  });
  ok('показан настоящий ответ, а не догадка про права ключа', /Country, region/.test(said), said);
  ok('и в нём нет выдумки про модель', !/нет прав на эту модель/.test(said), said);

  // Ответ нашего посредника не выдаётся за ответ OpenAI.
  await p3.addInitScript(() => {});
  const mine = await p3.evaluate(async () => {
    const ai = await import('/app/js/ai.js');
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ error: 'ключ OpenAI не задан в функции' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }));
    try { await ai.checkKey(); return 'ошибки не было'; } catch (e) { return e.message; }
  });
  ok('беда облака названа бедой облака', /Облако: ключ OpenAI не задан в функции/.test(mine), mine);
  await ctx3.close();
}

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ выбор модели и текст про данные в порядке');
process.exit(bad ? 1 : 0);
