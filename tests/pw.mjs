// Playwright ставится по-разному: где-то он в проекте, где-то — глобально.
// Единственное место, которое об этом знает: наборы просто берут отсюда.
// Свой путь можно передать в PLAYWRIGHT, если он лежит ещё где-то.
const paths = [
  process.env.PLAYWRIGHT,
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs',
].filter(Boolean);

let mod = null;
for (const p of paths) {
  try { mod = await import(p); break; } catch { /* пробуем следующий */ }
}
if (!mod) {
  console.error('Playwright не найден. Поставь его — npm i -D playwright && npx playwright install chromium —\n'
    + 'или укажи путь: PLAYWRIGHT=/путь/к/playwright/index.mjs ./run.sh --fast');
  process.exit(2);
}

export const { chromium, devices } = mod;
