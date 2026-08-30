// Сверка migrate с эталоном. migrate — единственная функция, которая переписывает
// данные человека: её вывод на наборе старых и кривых форм зафиксирован в
// miggolden.json, и любая правка, которая его меняет, должна делать это осознанно.
//
// Если изменение верное — пересними эталон: node migbless.mjs, — и посмотри
// глазами в git diff, что поехало именно то, что ты хотела.
import { chromium, devices } from './pw.mjs';
import { readFileSync } from 'node:fs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);

const cases = JSON.parse(readFileSync(new URL('./migcases.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./miggolden.json', import.meta.url), 'utf8'));
const got = await p.evaluate(async cs => {
  const { migrate } = await import('/app/js/store.js');
  const norm = o => {
    const seen = new Map();
    return JSON.parse(JSON.stringify(o, (k, v) => {
      if (typeof v === 'string' && /^[a-z0-9]{12}$/.test(v)) {
        if (!seen.has(v)) seen.set(v, 'id' + seen.size);
        return seen.get(v);
      }
      if (k === 'updatedAt' || k === 'createdAt' || k === 'at') return typeof v === 'string' && v ? 'когда-то' : v;
      return v;
    }));
  };
  const r = {};
  for (const [name, input] of Object.entries(cs)) {
    try { r[name] = norm(migrate(JSON.parse(JSON.stringify(input)))); }
    catch (e) { r[name] = { __упал: String(e.message) }; }
  }
  return r;
}, cases);

// Где именно разошлось — иначе сравнение двух простыней ничего не подсказывает.
const where = (a, b2, path = '') => {
  if (JSON.stringify(a) === JSON.stringify(b2)) return null;
  if (a && b2 && typeof a === 'object' && typeof b2 === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b2)])) {
      const d = where(a[k], b2[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return `${path}: было ${JSON.stringify(b2)?.slice(0, 60)}, стало ${JSON.stringify(a)?.slice(0, 60)}`;
};
for (const name of Object.keys(golden)) {
  ok(`«${name}» совпадает с эталоном`, JSON.stringify(got[name]) === JSON.stringify(golden[name]),
    where(got[name], golden[name]) || '');
}
const extra = Object.keys(got).filter(k => !(k in golden));
ok('эталон покрывает все формы', extra.length === 0, extra.join(', '));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ migrate даёт ровно то, что и раньше');
process.exit(bad ? 1 : 0);
