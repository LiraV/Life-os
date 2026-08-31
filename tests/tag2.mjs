// Своя пилюля «Растяжка» обязана оставаться «Растяжкой». Заготовку с таким
// именем однажды переименовали в «Шпагат», и перевод шёл при каждой загрузке —
// он ловил и то, что человек завёл сам, а тёзку потом схлопывало в одну.
import { chromium, devices } from './pw.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ serviceWorkers: 'block', locale: 'ru-RU', ...devices['iPhone 13'] });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
const p = await ctx.newPage();
const errs = []; let bad = 0;
const ok = (n, c, extra = '') => { if (!c) bad++; console.log(`${c ? '✓' : '✗'} ${n}${extra ? ' — ' + extra : ''}`); };
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
const tags = () => p.evaluate(() => JSON.parse(localStorage.getItem('lifeos.state')).sport.tags.map(t => t.name));

await p.goto('http://127.0.0.1:8765/', { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.getByText('пропустить онбординг').click(); await p.waitForTimeout(600);
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('lifeos.state')); s.ui.tips = 'off'; localStorage.setItem('lifeos.state', JSON.stringify(s)); location.reload(); });
await p.waitForTimeout(900);

// Человек завёл свою пилюлю с тем же именем, что была у старой заготовки.
await p.evaluate(async () => {
  const { update, uid } = await import('/app/js/store.js');
  update(s => { s.sport.tags.push({ id: uid(), name: 'Растяжка' }); });
});
await p.waitForTimeout(400);
ok('пилюля завелась', (await tags()).includes('Растяжка'), (await tags()).join(', '));

await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(900);
const after = await tags();
ok('и пережила перезагрузку', after.includes('Растяжка'), after.join(', '));
ok('«Шпагат» при этом на месте', after.includes('Шпагат'), after.join(', '));
ok('пилюля не задвоилась', after.filter(x => x === 'Растяжка').length === 1, after.join(', '));

// А старая заготовка — та самая, с посевным id, — переименовывается как и
// прежде: перевод никуда не делся, он просто перестал хватать чужое.
await p.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('lifeos.state'));
  s.sport.tags = [{ id: 'stq5x3n8', name: 'Растяжка' }];
  localStorage.setItem('lifeos.state', JSON.stringify(s));
});
const seeded = await p.evaluate(async () => {
  const { migrate } = await import('/app/js/store.js');
  // Посевной id считается из имени — берём тот же, что был у заготовки.
  const h = (kind, name) => {
    const s2 = `${kind}:${name.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()}`;
    let x = 2166136261;
    for (let i = 0; i < s2.length; i++) { x ^= s2.charCodeAt(i); x = Math.imul(x, 16777619); }
    return `s${(x >>> 0).toString(36)}${s2.length.toString(36)}`;
  };
  const out = migrate({ v: 53, onboarded: true, sport: { tags: [{ id: h('tag', 'Растяжка'), name: 'Растяжка' }] } });
  return out.sport.tags.map(t => t.name);
});
ok('заготовка по-прежнему становится «Шпагатом»', seeded.includes('Шпагат') && !seeded.includes('Растяжка'), seeded.join(', '));
await b.close();
if (errs.length) { console.log(errs.join('\n')); bad += errs.length; }
console.log(bad ? `✗ ошибок: ${bad}` : '✓ своя пилюля остаётся своей');
process.exit(bad ? 1 : 0);
