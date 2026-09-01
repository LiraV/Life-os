// Снимок вывода migrate на наборе форм — эталон, с которым сверяются правки.
import { chromium, devices } from './pw.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
const cases = JSON.parse(readFileSync('./migcases.json', 'utf8'));
const out = await p.evaluate(async cs => {
  const { migrate } = await import('/app/js/store.js');
  const today = new Date().toISOString().slice(0, 10);
  const norm = o => {
    const seen = new Map();
    return JSON.parse(JSON.stringify(o, (k, v) => {
      if (typeof v === 'string' && /^[a-z0-9]{12}$/.test(v)) {
        if (!seen.has(v)) seen.set(v, 'id' + seen.size);
        return seen.get(v);
      }
      if (k === 'updatedAt' || k === 'createdAt' || k === 'at') return typeof v === 'string' && v ? 'когда-то' : v;
      // Сегодняшняя дата подставляется в пустое состояние сама, поэтому эталон
      // ломался бы каждую полночь. Проверяем не «какое сегодня», а всё прочее.
      if (typeof v === 'string' && today && (v === today || v.startsWith(`${today}T`))) return 'сегодня';
      // То же и с якорями месяца и года: они тоже ставятся по «сейчас», и
      // эталон, снятый в августе, разошёлся бы первого сентября.
      if (typeof v === 'string' && v === today.slice(0, 7)) return 'этот месяц';
      if (typeof v === 'string' && v === today.slice(0, 4)) return 'этот год';
      return v;
    }));
  };
  const r = {};
  for (const [name, input] of Object.entries(cs)) r[name] = norm(migrate(JSON.parse(JSON.stringify(input))));
  return r;
}, cases);
writeFileSync('./miggolden.json', JSON.stringify(out, null, 1));
console.log('эталон снят по', Object.keys(out).length, 'формам');
await b.close();
