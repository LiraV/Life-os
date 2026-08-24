// «Бюджет» по логике планировщика из таблицы: план на месяц по статьям,
// факт по неделям, копилки отдельно от трат, свод план/факт и правила.
//
// Единственный источник правды — список операций. Балансы и итоги считаются
// из него, чтобы нигде не разошлись две копии одной суммы.

import { S, update, uid } from '../store.js';
import { todayISO, monthKey, addMonths, monthTitle, MONTHS, parseISO, dayShort } from '../dates.js';
import { h, raw, field, bar, toast, openSheet } from '../ui.js';

const B = () => S.budget;
const ym = () => S.ui.budMonth || monthKey(todayISO());
const tab = () => S.ui.budTab || 'month';

export const money = n => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
const inMonth = (op, m) => (op.date || '').startsWith(m);
const opsOf = m => B().ops.filter(o => inMonth(o, m)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const catName = (kind, id) => (B().cats[kind].find(c => c.id === id) || {}).name || 'без статьи';
const planOf = (m, kind, id) => Number(B().plans[m]?.[kind]?.[id]) || 0;

/** Неделя месяца как в таблице: первая — первые семь дней, и так далее. */
const weekOfMonth = date => Math.ceil(parseISO(date).getDate() / 7);

export function sumBy(m, kind) {
  return B().ops.filter(o => o.kind === kind && inMonth(o, m)).reduce((a, o) => a + (Number(o.sum) || 0), 0);
}

/** Баланс на конец месяца: стартовая сумма плюс всё, что случилось до его конца. */
export function balanceAt(m) {
  const end = m + '-32';
  return B().ops.filter(o => (o.date || '') < end).reduce((acc, o) => {
    if (o.kind === 'income') return acc + (Number(o.sum) || 0);
    if (o.kind === 'expense') return acc - (Number(o.sum) || 0);
    return acc - (Number(o.sum) || 0);   // отложенное уходит с баланса в копилку
  }, B().start);
}

export const vaultBalance = v =>
  (Number(v.start) || 0) + B().ops.filter(o => o.kind === 'save' && o.vaultId === v.id).reduce((a, o) => a + (Number(o.sum) || 0), 0);

const TABS = [['month', 'Месяц'], ['ops', 'Операции'], ['vaults', 'Копилки']];

export function render() {
  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ сферы</button>
      <span class="tag">казна</span>
    </div>
    <div class="title">Бюджет</div>
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ month: monthView, ops: opsView, vaults: vaultsView }[tab()]())}
    <div style="height:4px"></div>`;
}

// ── месяц ───────────────────────────────────────────────────────
function monthView() {
  const m = ym();
  const inc = sumBy(m, 'income'), exp = sumBy(m, 'expense'), sav = sumBy(m, 'save');
  const planInc = B().cats.income.reduce((a, c) => a + planOf(m, 'income', c.id), 0);
  const planExp = B().cats.expense.reduce((a, c) => a + planOf(m, 'expense', c.id), 0);
  const ops = opsOf(m);

  const weeks = [1, 2, 3, 4, 5].map(w => {
    const list = ops.filter(o => weekOfMonth(o.date) === w);
    return {
      w,
      exp: list.filter(o => o.kind === 'expense').reduce((a, o) => a + o.sum, 0),
      inc: list.filter(o => o.kind === 'income').reduce((a, o) => a + o.sum, 0),
      sav: list.filter(o => o.kind === 'save').reduce((a, o) => a + o.sum, 0),
    };
  }).filter(x => x.exp || x.inc || x.sav);

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev">‹</button>
      <div class="ink"><b>${monthTitle(m)}</b></div>
      <button class="arrow" data-act="next">›</button>
    </div>

    <div class="card">
      <div class="caps">Итог месяца</div>
      <div class="row between"><span class="ink">Доходы</span><span class="ink"><b>${money(inc)}</b>${planInc ? raw(h`<span class="lab"> из ${money(planInc)}</span>`) : ''}</span></div>
      <div class="row between"><span class="ink">Расходы</span><span class="ink"><b>${money(exp)}</b>${planExp ? raw(h`<span class="lab"> из ${money(planExp)}</span>`) : ''}</span></div>
      ${planExp ? raw(bar(Math.round((exp / planExp) * 100), exp > planExp)) : ''}
      <div class="row between"><span class="ink">Отложено</span><span class="ink">${money(sav)}</span></div>
      <div class="row between" style="border-top:1px solid var(--track); padding-top:7px">
        <span class="ink"><b>Остаток</b></span><span class="ink"><b>${money(balanceAt(m))}</b></span></div>
      <div class="lab">Остаток считается из операций: стартовая сумма плюс доходы, минус расходы и отложенное.
        <span data-act="startset" style="text-decoration:underline; cursor:pointer">стартовая сумма</span></div>
    </div>

    ${weeks.length ? raw(h`
      <div class="card">
        <div class="caps">По неделям</div>
        ${weeks.map(x => raw(h`<div class="row between">
          <span class="lab" style="width:76px">${x.w} неделя</span>
          <span class="lab grow">−${money(x.exp)}${x.inc ? ` · +${money(x.inc)}` : ''}${x.sav ? ` · в копилку ${money(x.sav)}` : ''}</span>
        </div>`))}
      </div>`) : ''}

    ${raw(catBlock('expense', 'Статьи расходов', m))}
    ${raw(catBlock('income', 'Доходы', m))}

    <div class="card">
      <div class="row between"><div class="caps">Правила</div>
        <button class="q-edit" data-act="ruleadd">+ добавить</button></div>
      ${B().rules.length ? raw(h`<div class="list">
        ${B().rules.map((r, i) => raw(h`<div class="int-row"><span class="dash">—</span>
          <span class="grow">${r}</span>
          <button class="q-edit" data-act="ruledel" data-i="${i}">×</button></div>`))}
      </div>`) : raw('<div class="lab">Свои принципы трат: «не брать в долг», «никакого такси».</div>')}
    </div>`;
}

function catBlock(kind, title, m) {
  const list = B().cats[kind];
  const fact = {};
  B().ops.filter(o => o.kind === kind && inMonth(o, m)).forEach(o => { fact[o.catId] = (fact[o.catId] || 0) + (Number(o.sum) || 0); });

  return h`
    <div class="card">
      <div class="row between"><div class="caps">${title}</div>
        <button class="q-edit" data-act="catadd" data-k="${kind}">+ статья</button></div>
      ${list.length ? list.map(c => {
        const f = fact[c.id] || 0, plan = planOf(m, kind, c.id);
        const pct = plan ? Math.round((f / plan) * 100) : 0;
        const over = kind === 'expense' && plan && f > plan;
        return raw(h`
          <div class="row between" data-act="catedit" data-k="${kind}" data-id="${c.id}" style="cursor:pointer">
            <span class="ink grow ellip">${c.name}</span>
            <span class="lab">${money(f)}${plan ? ` / ${money(plan)}` : ''}</span>
          </div>
          ${plan ? raw(bar(pct, over)) : ''}`);
      }) : raw('<div class="lab">Статей пока нет.</div>')}
      <div class="lab">Тап по статье — план на месяц, переименование, удаление.</div>
    </div>`;
}

// ── операции ────────────────────────────────────────────────────
function opsView() {
  const m = ym();
  const ops = opsOf(m);
  const byDate = {};
  ops.forEach(o => { (byDate[o.date] ||= []).push(o); });

  return h`
    <div class="stepper">
      <button class="arrow" data-act="prev">‹</button>
      <div class="ink"><b>${monthTitle(m)}</b></div>
      <button class="arrow" data-act="next">›</button>
    </div>

    <div class="row">
      <button class="pill grow" style="text-align:center" data-act="opadd" data-k="expense">− Трата</button>
      <button class="pill grow" style="text-align:center" data-act="opadd" data-k="income">+ Доход</button>
      <button class="pill grow" style="text-align:center" data-act="opadd" data-k="save">В копилку</button>
    </div>

    ${ops.length ? Object.keys(byDate).sort().reverse().map(d => raw(h`
      <div class="card">
        <div class="caps">${dayShort(d)}</div>
        ${byDate[d].map(o => raw(h`
          <div class="row between" data-act="opedit" data-id="${o.id}" style="cursor:pointer">
            <div class="grow">
              <div class="ink">${o.kind === 'save' ? 'В копилку' : catName(o.kind, o.catId)}</div>
              ${o.note ? raw(h`<div class="lab">${o.note}</div>`) : ''}
            </div>
            <span class="ink" style="color:${o.kind === 'income' ? '#5a7a52' : 'var(--ink)'}">${o.kind === 'income' ? '+' : '−'}${money(Math.abs(o.sum))}</span>
          </div>`))}
      </div>`))
    : raw('<div class="card dash"><div class="empty">За этот месяц операций нет.</div></div>')}`;
}

// ── копилки ─────────────────────────────────────────────────────
function vaultsView() {
  return h`
    ${B().vaults.map(v => {
      const bal = vaultBalance(v);
      return raw(h`
        <div class="card">
          <div class="row between">
            <div class="ink grow" data-act="vaultedit" data-id="${v.id}" style="cursor:pointer"><b>${v.name}</b></div>
            <span class="ink"><b>${money(bal)}</b></span>
          </div>
          <div class="pills">
            <button class="pill" data-act="vaultadd" data-id="${v.id}">пополнить</button>
            <button class="pill" data-act="vaulttake" data-id="${v.id}">снять</button>
          </div>
        </div>`);
    })}
    <button class="add" data-act="vaultnew">+ Копилка</button>
    <div class="card mute"><div class="lab">Пополнение уходит с остатка и не считается тратой — как отдельная колонка «накоп» в таблице.</div></div>`;
}

// ── шторки ──────────────────────────────────────────────────────
const num = v => Math.max(0, Math.round(Number(String(v ?? '').replace(',', '.')) || 0));

function opSheet(op, kind) {
  const isNew = !op;
  const k = op?.kind || kind;
  const o = op || { id: uid(), kind: k, date: todayISO(), sum: '', note: '', catId: B().cats[k === 'save' ? 'expense' : k]?.[0]?.id, vaultId: B().vaults[0]?.id };
  const title = { expense: 'Трата', income: 'Доход', save: 'В копилку' }[k];

  openSheet({
    title: isNew ? title : `${title} · правка`,
    body: [
      field.number('sum', 'Сколько', o.sum, { min: 0 }),
      k === 'save'
        ? (B().vaults.length
          ? field.select('vaultId', 'Копилка', B().vaults.map(v => ({ value: v.id, label: v.name })), o.vaultId)
          : field.note('Сначала заведи копилку на вкладке «Копилки».'))
        : field.select('catId', 'Статья', B().cats[k].map(c => ({ value: c.id, label: c.name })), o.catId),
      field.text('note', 'Комментарий', o.note, 'например, «10 кг корма + наполнитель»'),
      field.date('date', 'Когда', o.date),
    ].join(''),
    primary: isNew ? 'Записать' : 'Сохранить',
    onSave: (v, close) => {
      const sum = num(v.sum);
      if (!sum) return toast('Введи сумму');
      if (k === 'save' && !v.vaultId) return toast('Нужна копилка');
      update(s => {
        const next = { ...o, kind: k, sum, note: (v.note || '').trim(), date: v.date || todayISO(), catId: v.catId || o.catId, vaultId: v.vaultId || o.vaultId };
        const i = s.budget.ops.findIndex(x => x.id === o.id);
        if (i >= 0) s.budget.ops[i] = next; else s.budget.ops.push(next);
        s.ui.budMonth = monthKey(next.date);
      });
      close();
      toast('Записала');
    },
    danger: isNew ? null : 'Удалить',
    onDanger: (_v, close) => { update(s => { s.budget.ops = s.budget.ops.filter(x => x.id !== o.id); }); close(); },
  });
}

export const actions = {
  back: () => { location.hash = '#/spheres'; },
  tab: v => update(s => { s.ui.budTab = v.v; }),
  prev: () => update(s => { s.ui.budMonth = addMonths(ym(), -1); }),
  next: () => update(s => { s.ui.budMonth = addMonths(ym(), 1); }),

  opadd: v => opSheet(null, v.k),
  opedit: v => opSheet(B().ops.find(x => x.id === v.id)),

  catadd: v => openSheet({
    title: v.k === 'income' ? 'Статья дохода' : 'Статья расхода',
    body: field.text('name', 'Название', '', 'например, «Питомец»'),
    primary: 'Добавить',
    onSave: (val, close) => {
      const name = (val.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => s.budget.cats[v.k].push({ id: uid(), name }));
      close();
    },
  }),

  catedit: v => {
    const cat = B().cats[v.k].find(c => c.id === v.id);
    if (!cat) return;
    const m = ym();
    openSheet({
      title: cat.name,
      sub: `план на ${monthTitle(m).toLowerCase()}`,
      body: [
        field.number('plan', 'План на месяц', planOf(m, v.k, cat.id) || '', { min: 0 }),
        field.text('name', 'Название', cat.name),
        field.note('План задаётся на каждый месяц отдельно — в следующем он начнётся с нуля.'),
      ].join(''),
      onSave: (val, close) => {
        const name = (val.name || '').trim();
        update(s => {
          const c = s.budget.cats[v.k].find(x => x.id === cat.id);
          if (c && name) c.name = name;
          const plan = num(val.plan);
          const byMonth = (s.budget.plans[m] ||= {});
          const byKind = (byMonth[v.k] ||= {});
          if (plan) byKind[cat.id] = plan; else delete byKind[cat.id];
        });
        close();
        toast('Сохранено');
      },
      danger: 'Удалить статью',
      onDanger: (_val, close) => {
        const used = B().ops.some(o => o.catId === cat.id);
        update(s => { s.budget.cats[v.k] = s.budget.cats[v.k].filter(x => x.id !== cat.id); });
        close();
        toast(used ? 'Убрала статью, операции остались' : 'Убрала');
      },
    });
  },

  startset: () => openSheet({
    title: 'Стартовая сумма',
    sub: 'сколько было на руках, когда начался учёт',
    body: field.number('n', 'Сумма', B().start || 0, { min: 0 }),
    onSave: (v, close) => { update(s => { s.budget.start = num(v.n); }); close(); toast('Сохранено'); },
  }),

  vaultnew: () => openSheet({
    title: 'Копилка',
    body: [field.text('name', 'На что', '', 'например, «Милан»'), field.number('start', 'Уже отложено', 0, { min: 0 })].join(''),
    primary: 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      update(s => s.budget.vaults.push({ id: uid(), name, start: num(v.start) }));
      close();
    },
  }),

  vaultedit: v => {
    const vault = B().vaults.find(x => x.id === v.id);
    if (!vault) return;
    openSheet({
      title: vault.name,
      body: [field.text('name', 'Название', vault.name), field.number('start', 'Было до начала учёта', vault.start || 0, { min: 0 })].join(''),
      onSave: (val, close) => {
        update(s => {
          const x = s.budget.vaults.find(y => y.id === vault.id);
          if (x) { x.name = (val.name || '').trim() || x.name; x.start = num(val.start); }
        });
        close();
      },
      danger: 'Удалить копилку',
      onDanger: (_val, close) => {
        update(s => {
          s.budget.vaults = s.budget.vaults.filter(x => x.id !== vault.id);
          s.budget.ops = s.budget.ops.filter(o => !(o.kind === 'save' && o.vaultId === vault.id));
        });
        close();
        toast('Убрала вместе с пополнениями');
      },
    });
  },

  vaultadd: v => opSheet({ id: uid(), kind: 'save', date: todayISO(), sum: '', note: '', vaultId: v.id }, 'save'),
  vaulttake: v => openSheet({
    title: 'Снять из копилки',
    body: field.number('n', 'Сколько', '', { min: 0 }),
    primary: 'Снять',
    onSave: (val, close) => {
      const n = num(val.n);
      if (!n) return toast('Введи сумму');
      // Снятие — то же пополнение с минусом: копилка уменьшается, остаток растёт.
      update(s => s.budget.ops.push({ id: uid(), kind: 'save', vaultId: v.id, sum: -n, date: todayISO(), note: 'снятие' }));
      close();
      toast('Вернула на остаток');
    },
  }),

  ruleadd: () => openSheet({
    title: 'Правила трат',
    sub: 'по одному в строке',
    body: field.area('text', 'Как хочу обращаться с деньгами', '', 'Не брать в долг\nНикакого такси'),
    primary: 'Добавить',
    onSave: (v, close) => {
      const lines = (v.text || '').split('\n').map(x => x.replace(/^[-–—•\s]+/, '').trim()).filter(Boolean);
      if (!lines.length) return toast('Пусто');
      update(s => s.budget.rules.push(...lines));
      close();
    },
  }),
  ruledel: v => update(s => { s.budget.rules.splice(Number(v.i), 1); }),
};
