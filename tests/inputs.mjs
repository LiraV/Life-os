// Поля быстрого ввода: очищаются после добавления и не теряют фокус.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', ...devices['iPhone 13'], locale: 'ru-RU' });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE: ' + m.text()); });
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const go = async hash => { await p.evaluate(x => { location.hash = x; }, hash); await p.waitForTimeout(650); };
const val = sel => p.inputValue(sel);
const focused = () => p.evaluate(() => document.activeElement?.dataset?.field || document.activeElement?.tagName || '—');

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(500);
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.ui.tips = 'off';
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);

// ── 1. инбокс: быстрый ввод подряд, без потери фокуса
await go('#/inbox');
const inp = p.locator('[data-field="quick"]');
await inp.click();
await p.keyboard.type('первая мысль'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok('инбокс: поле очистилось', await val('[data-field="quick"]') === '', await val('[data-field="quick"]'));
ok('инбокс: фокус остался в поле', await focused() === 'quick', await focused());
ok('инбокс: запись появилась', (await st()).inbox.length === 1);
await p.keyboard.type('вторая'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok('инбокс: вторая мысль пишется подряд', (await st()).inbox.length === 2 && await val('[data-field="quick"]') === '');
ok('инбокс: обе видны в списке', /первая мысль/.test(await p.locator('.scr').innerText())
  && /вторая/.test(await p.locator('.scr').innerText()));
ok('инбокс: счётчик пересчитался', /2 записи/.test(await p.locator('.scr').innerText()),
  (await p.locator('.scr').innerText()).match(/\d+ запис\S+/)?.[0]);

// ── 2. чат «Внутри» — поле есть только с ключом OpenAI, без него проверять нечего
await go('#/inside/chat');
ok('чат без ключа не показывает поле ввода', await p.locator('[data-field="ask"]').count() === 0,
  String(await p.locator('[data-field="ask"]').count()));

// ── 3. шторки: поле пустое на каждом заходе
const sheetCase = async (name, open, field2, text, count) => {
  await open();
  await p.fill(`.sheet [data-field="${field2}"]`, text);
  await p.locator('.sheet .pill', { hasText: '+' }).last().click().catch(() => {});
  await p.waitForTimeout(600);
  const still = await p.locator('.sheet').count();
  const v = still ? await val(`.sheet [data-field="${field2}"]`).catch(() => '') : '';
  ok(`${name}: поле пустое после добавления`, v === '', `«${v}»`);
  ok(`${name}: запись добавилась`, await count(), '');
  if (still) await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
};

await go('#/health');
await sheetCase('мерки тела', async () => { await p.locator('[data-act="metrics"]').click(); await p.waitForTimeout(500); },
  'mtnew', 'Икра', async () => (await st()).health.metrics.length === 1);

await go('#/free');
await sheetCase('площадки', async () => { await p.locator('[data-act="places"]').click(); await p.waitForTimeout(500); },
  'lsname', 'Юду', async () => (await st()).free.places.length === 1);

await go('#/spheres/blog');
await sheetCase('рубрики', async () => { await p.locator('[data-act="rubrics"]').click(); await p.waitForTimeout(500); },
  'lsnew', 'Быт', async () => (await st()).blog.rubrics.length === 1);

// ── 4. «взять шаги» не закрывается после первого
await go('#/free');
await p.locator('[data-act="steps"]').click(); await p.waitForTimeout(500);
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(600);
ok('шаги: шторка осталась открытой', await p.locator('.sheet').count() === 1);
ok('шаги: взятая подсказка ушла из списка', await p.locator('.sheet [data-act="stepadd"]').count() === 9,
  String(await p.locator('.sheet [data-act="stepadd"]').count()));
await p.locator('.sheet [data-act="stepadd"]').first().click(); await p.waitForTimeout(600);
ok('шаги: второй берётся подряд', (await st()).free.steps.length === 2, String((await st()).free.steps.length));
await p.fill('.sheet [data-field="stnew"]', 'свой шаг');
await p.locator('.sheet [data-act="stepown"]').click(); await p.waitForTimeout(600);
ok('шаги: своё поле очистилось', await val('.sheet [data-field="stnew"]') === '', await val('.sheet [data-field="stnew"]'));
ok('шаги: свой шаг записался', (await st()).free.steps.length === 3);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// ── 5. упаковка поста и чек-лист работы
await go('#/spheres/blog');
await p.locator('[data-act="postadd"]').click(); await p.waitForTimeout(500);
await p.fill('.sheet [data-field="pknew"]', 'свой пункт');
await p.locator('.sheet [data-act="pkadd"]').click(); await p.waitForTimeout(400);
ok('упаковка: поле очистилось', await val('.sheet [data-field="pknew"]') === '', await val('.sheet [data-field="pknew"]'));
ok('упаковка: пункт добавился', await p.locator('.sheet .cl-item').count() === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// ── 6. поиск страны — не очищается, и это правильно
await go('#/trips');
await p.locator('[data-act="tab"][data-v="add"]').first().click(); await p.waitForTimeout(500);
await p.locator('input[data-act-input="search"]').click();
await p.keyboard.type('тур'); await p.waitForTimeout(400);
ok('поиск: введённое остаётся на месте', await val('input[data-act-input="search"]') === 'тур');
ok('поиск: фокус в поле', await focused() === 'q', await focused());

console.log(errs.length ? '✗ ошибки: ' + errs.join(' | ') : '✓ ошибок нет');
if (bad || errs.length) console.log('ПРОВАЛ');
await b.close();
