// Учёт записей: у каждой есть свой id, место в списке, время появления и время
// последней правки, а у удалённой остаётся след. Всё это проставляется в одном
// месте — в самой записи состояния, — поэтому проверяем именно её.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
const st = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')));
const run = async src => {
  await p.evaluate(async s => {
    const { update, uid } = await import('/app/js/store.js');
    const fn = new Function('s', 'uid', s);
    update(x => fn(x, uid));
  }, src);
  await p.waitForTimeout(250);
};

let s = await st();
// Правило бюджета было строкой и удалялось по номеру в списке.
const rule = s.budget.rules[0];
ok('правило бюджета стало записью со своим id', !!rule?.id && typeof rule.text === 'string', JSON.stringify(rule));
ok('у записи есть место в списке', rule.order === 0, String(rule.order));
ok('время у старой записи пустое, а не выдуманное', rule.createdAt === '' && rule.updatedAt === '',
  `${JSON.stringify(rule.createdAt)}/${JSON.stringify(rule.updatedAt)}`);

await run("s.customSpheres.push({ key: 'cmusic', name: 'Музыка', mech: 'своя', kinds: ['log'], unit: 'раз', dir: 'none', archived: false })");
let sph = (await st()).customSpheres[0];
ok('своя сфера зовётся своим key, второго имени ей не завели', sph.key === 'cmusic' && sph.id === undefined, JSON.stringify(sph));
await run("s.inbox.push({ id: uid(), text: 'Мысль', note: '', sphere: '', createdAt: '2026-08-30' })");
s = await st();
const it = s.inbox[0];
ok('у новой записи отмечено время правки', /^\d{4}-\d{2}-\d{2}T/.test(it.updatedAt || ''), it.updatedAt);
ok('своя дата записи не затёрта', it.createdAt === '2026-08-30', it.createdAt);
const first = it.updatedAt;

await p.waitForTimeout(1100);
await run("s.inbox[0].text = 'Мысль, дописанная'");
s = await st();
ok('правка сдвигает время правки', s.inbox[0].updatedAt !== first, s.inbox[0].updatedAt);
ok('и не трогает время появления', s.inbox[0].createdAt === '2026-08-30', s.inbox[0].createdAt);

const untouched = s.budget.rules[0].updatedAt;
await run("s.inbox[0].note = 'ещё'");
s = await st();
ok('чужие записи от этого не «обновляются»', s.budget.rules[0].updatedAt === untouched, s.budget.rules[0].updatedAt);

await run("s.inbox.push({ id: uid(), text: 'Вторая' }); s.inbox.reverse()");
s = await st();
ok('перестановка меняет места', s.inbox.map(x => x.order).join(',') === '0,1'
  && s.inbox[0].text === 'Вторая', s.inbox.map(x => `${x.text}:${x.order}`).join(', '));

const gone = s.inbox.find(x => x.text.startsWith('Мысль')).id;
await run("s.inbox = s.inbox.filter(x => !x.text.startsWith('Мысль'))");
s = await st();
const trace = (s.deleted || []).find(x => x.id === gone);
ok('от удалённой записи остался след', !!trace, JSON.stringify(trace));
ok('след знает, откуда запись', trace?.from === 'inbox', trace?.from);
ok('сам след не считается записью', !(s.deleted || []).some(x => 'order' in x), JSON.stringify(s.deleted?.[0]));

// Запись с тем же id вернулась — след снимается.
await run(`s.inbox.push({ id: '${gone}', text: 'Вернулась' })`);
s = await st();
ok('вернувшаяся запись снимает свой след', !(s.deleted || []).some(x => x.id === gone), JSON.stringify(s.deleted));

// Каждая запись состояния под учётом — без исключений.
const all = await p.evaluate(() => {
  const S = JSON.parse(localStorage.getItem('lifeos.state'));
  const bad = [];
  const walk = (node, path, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    for (const [k, v] of Object.entries(node)) {
      if (!path && k === 'deleted') continue;
      const at = path ? `${path}.${k}` : k;
      if (Array.isArray(v)) {
        v.forEach(x => {
          if (x && typeof x === 'object') {
            if (!x.id && !x.key) bad.push(`${at}: запись без имени`);
            else if (typeof x.order !== 'number') bad.push(`${at}: запись без места`);
            else if (x.createdAt == null || x.updatedAt == null) bad.push(`${at}: запись без времени`);
            walk(x, at + '[]', depth + 1);
          }
        });
      } else if (v && typeof v === 'object') walk(v, at, depth + 1);
    }
  };
  walk(S, '');
  return bad;
});
ok('все записи состояния под учётом', all.length === 0, all.slice(0, 3).join(' | '));

await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ учёт записей на месте');
process.exit(bad ? 1 : 0);
