// «Бюджет» по логике планировщика из таблицы: план на месяц по статьям,
// факт по неделям, копилки отдельно от трат, свод план/факт и правила.
//
// Единственный источник правды — список операций. Балансы и итоги считаются
// из него, чтобы нигде не разошлись две копии одной суммы.

import { goBack, syncTab, goTab, tabOf } from '../nav.js';
import { S, update, uid, touchBudget, nameTaken } from '../store.js';
import { todayISO, monthKey, addMonths, monthTitle, MONTHS, parseISO, dayShort, stampLabel, daysInMonth } from '../dates.js';
import { h, raw, field, bar, toast, openSheet, money } from '../ui.js';
import { buildXlsx, saveFile, readXlsx, pickFile } from '../xlsx.js';
// Остаток копилки считается в selectors: то же число нужно целям «накопить».
import { vaultBalance, sumBy, balanceAt } from '../selectors.js';
import { sphereGoalButton, sphereGoalsCard, sphereGoalActions } from '../spheregoal.js';
export { vaultBalance };

const B = () => S.budget;
const ym = () => S.ui.budMonth || monthKey(todayISO());
const tab = () => tabOf(TABS, S.ui.budTab);

const inMonth = (op, m) => (op.date || '').startsWith(m);
const opsOf = m => B().ops.filter(o => inMonth(o, m)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const catName = (kind, id) => (B().cats[kind].find(c => c.id === id) || {}).name || 'без статьи';
const planOf = (m, kind, id) => Number(B().plans[m]?.[kind]?.[id]) || 0;

/** Неделя месяца как в таблице: первая — первые семь дней, и так далее. */
const weekOfMonth = date => Math.ceil(parseISO(date).getDate() / 7);


/** Баланс на конец месяца: стартовая сумма плюс всё, что случилось до его конца. */



const TABS = [['month', 'Месяц'], ['ops', 'Операции'], ['vaults', 'Копилки']];

/** Правка данных бюджета: то же update, но со штампом времени.
 *  Переключение вкладок и месяцев идёт обычным update — это не заполнение. */
const upd = fn => update(s => { fn(s); touchBudget(s); });

export function render(params = []) {
  syncTab(params, TABS, 'budTab');

  return h`
    <div class="row between">
      <button class="q-edit" data-act="back">‹ назад</button>
      <span class="tag">казна</span>
    </div>
    <div class="title">Бюджет</div>
    ${B().updatedAt ? raw(h`<div class="lab">заполняли ${stampLabel(B().updatedAt)}</div>`) : raw('<div class="lab">ещё ничего не записано</div>')}
    <div class="pills">${TABS.map(([k, l]) => raw(h`<button class="pill ${tab() === k ? 'on' : ''}" data-act="tab" data-v="${k}">${l}</button>`))}</div>
    ${raw({ month: monthView, ops: opsView, vaults: vaultsView }[tab()]())}
    ${raw(sphereGoalsCard('money'))}
    ${raw(sphereGoalButton('money'))}
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
        ${B().rules.map(r => raw(h`<div class="int-row"><span class="dash">—</span>
          <span class="grow">${r.text}</span>
          <button class="q-edit" data-act="ruledel" data-id="${r.id}">×</button></div>`))}
      </div>`) : raw('<div class="lab">Свои принципы трат: «не брать в долг», «никакого такси».</div>')}
    </div>

    <div class="card mute">
      <div class="caps">Таблица</div>
      <div class="lab">В файле весь бюджет, а не только этот месяц: все операции, планы по статьям и копилки — тремя листами. Тот же файл можно поправить и загрузить обратно.</div>
      <button class="add" data-act="export">Выгрузить в Excel</button>
      <button class="add" data-act="import">Загрузить из Excel</button>
    </div>`;
}

function catBlock(kind, title, m) {
  const list = B().cats[kind];
  const fact = {};
  // Копим в копейках, а показываем в рублях: иначе у суммы вылезает дробный
  // хвост, которого никто не вводил.
  B().ops.filter(o => o.kind === kind && inMonth(o, m))
    .forEach(o => { fact[o.catId] = (fact[o.catId] || 0) + Math.round((Number(o.sum) || 0) * 100); });
  Object.keys(fact).forEach(k => { fact[k] /= 100; });

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
    <button class="q-edit" data-act="bulk" data-m="${m}">итогом за месяц ›</button>

    ${ops.length ? Object.keys(byDate).sort().reverse().map(d => raw(h`
      <div class="card">
        <div class="caps">${dayShort(d)}</div>
        ${byDate[d].map(o => raw(h`
          <div class="row between" data-act="opedit" data-id="${o.id}" style="cursor:pointer">
            <div class="grow">
              <div class="ink">${o.kind === 'save' ? 'В копилку' : catName(o.kind, o.catId)}</div>
              ${o.note ? raw(h`<div class="lab">${o.note}</div>`) : ''}
            </div>
            <span class="ink" style="color:${o.kind === 'income' ? '#5a7a52' : 'var(--ink)'}">${o.kind === 'income' ? '+' : '−'}${money(Math.abs(o.sum), o.cur)}${o.bulk ? ' · итог' : ''}</span>
          </div>`))}
      </div>`))
    : raw('<div class="card dash"><div class="empty">За этот месяц операций нет.</div></div>')}`;
}

// ── копилки ─────────────────────────────────────────────────────
function vaultsView() {
  return h`
    ${B().vaults.map(v => {
      const bal = vaultBalance(v);
      const start = Number(v.start) || 0;
      const moved = bal - start;
      return raw(h`
        <div class="card">
          <div class="row between">
            <div class="ink grow"><b>${v.name}</b></div>
            <span class="ink"><b>${money(bal)}</b></span>
          </div>
          ${start || moved ? raw(h`<div class="lab">старт ${money(start)}${moved ? ` · ${moved > 0 ? '+' : '−'}${money(Math.abs(moved))} за время учёта` : ''}</div>`) : ''}
          <div class="pills">
            <button class="pill" data-act="vaultadd" data-id="${v.id}">пополнить</button>
            <button class="pill" data-act="vaulttake" data-id="${v.id}">снять</button>
            <button class="pill" data-act="vaultedit" data-id="${v.id}">стартовая сумма ›</button>
          </div>
        </div>`);
    })}
    <button class="add" data-act="vaultnew">+ Копилка</button>
    <div class="card mute"><div class="lab">Пополнение уходит с остатка и не считается тратой — как отдельная колонка «накоп» в таблице.
      Стартовая сумма на остаток не влияет: это то, что уже лежало в копилке до начала учёта.</div></div>`;
}

// ── шторки ──────────────────────────────────────────────────────
// Копейки не выбрасываем: округление до рубля теряло их на вводе, и «1 200,50»
// превращалось в «1 201» ещё до того, как человек нажимал «Сохранить».
// Запятая и точка равноправны: на телефоне под рукой то одна, то другая.
const num = v => Math.max(0, Math.round((Number(String(v ?? '').replace(',', '.')) || 0) * 100) / 100);


/**
 * Итог за месяц одной записью. Нужен, когда месяцы прожиты, а расписывать их
 * по операциям незачем: человек помнит, сколько заработал за май, но не помнит
 * каждый перевод. Так прошлое попадает в остаток и в счёт целей, не требуя
 * выдумывать несуществующие подробности.
 *
 * Записи помечены как итог и заменяются, а не складываются: нажать дважды —
 * обычное дело, и удваивать доход за это нельзя.
 */
function bulkSheet(m) {
  const had = B().ops.filter(o => o.bulk && inMonth(o, m));
  const was = k => had.find(o => o.kind === k)?.sum ?? '';
  const last = `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
  openSheet({
    title: `Итог за ${monthTitle(m).toLowerCase()}`,
    sub: had.length ? 'итог уже записан — сохранение его заменит' : 'одной записью, без подробностей',
    body: [
      field.money('income', 'Заработано', was('income')),
      field.money('expense', 'Потрачено', was('expense')),
      field.money('save', 'Отложено', was('save')),
      field.note(`Запишется одной строкой на ${dayShort(last)} с пометкой «итог месяца». `
        + 'Обычные операции этого месяца останутся как есть — итог их не заменяет и не отменяет.'),
    ].join(''),
    primary: 'Записать',
    onSave: (v, close) => {
      const rows = ['income', 'expense', 'save'].map(k => [k, num(v[k])]).filter(([, s]) => s > 0);
      upd(s => {
        s.budget.ops = s.budget.ops.filter(o => !(o.bulk && inMonth(o, m)));
        rows.forEach(([kind, sum]) => s.budget.ops.push({
          id: uid(), date: last, kind, sum, bulk: true,
          catId: kind === 'save' ? '' : (s.budget.cats[kind === 'income' ? 'income' : 'expense'][0]?.id || ''),
          vaultId: kind === 'save' ? (s.budget.vaults[0]?.id || '') : '',
          note: 'итог месяца',
        }));
      });
      close();
      toast(rows.length ? 'Итог записан' : 'Итог убран');
    },
    danger: had.length ? 'Убрать итог' : null,
    onDanger: (_v, close) => {
      upd(s => { s.budget.ops = s.budget.ops.filter(o => !(o.bulk && inMonth(o, m))); });
      close();
      toast('Убрала');
    },
  });
}

function opSheet(op, kind) {
  const isNew = !op;
  const k = op?.kind || kind;
  const o = op || { id: uid(), kind: k, date: todayISO(), sum: '', note: '', catId: B().cats[k === 'save' ? 'expense' : k]?.[0]?.id, vaultId: B().vaults[0]?.id };
  const title = { expense: 'Трата', income: 'Доход', save: 'В копилку' }[k];

  openSheet({
    title: isNew ? title : `${title} · правка`,
    body: [
      field.money('sum', 'Сколько', o.sum),
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
      upd(s => {
        const next = { ...o, kind: k, sum, note: (v.note || '').trim(), date: v.date || todayISO(), catId: v.catId || o.catId, vaultId: v.vaultId || o.vaultId };
        const i = s.budget.ops.findIndex(x => x.id === o.id);
        if (i >= 0) s.budget.ops[i] = next; else s.budget.ops.push(next);
        s.ui.budMonth = monthKey(next.date);
      });
      close();
      toast('Записала');
    },
    danger: isNew ? null : 'Удалить',
    onDanger: (_v, close) => { upd(s => { s.budget.ops = s.budget.ops.filter(x => x.id !== o.id); }); close(); },
  });
}

const KIND_RU = { expense: 'расход', income: 'доход', save: 'копилка' };
const RU_KIND = { расход: 'expense', доход: 'income', копилка: 'save', накопление: 'save', сейв: 'save' };

/** Ищем строку заголовков: файл мог прийти с шапкой, пустыми строками или названием сверху. */
function findHeader(rows, needed) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const low = rows[i].map(c => String(c ?? '').trim().toLowerCase());
    const at = {};
    needed.forEach(n => { const j = low.findIndex(c => c.startsWith(n)); if (j >= 0) at[n] = j; });
    if (Object.keys(at).length === needed.length) return { row: i, at };
  }
  return null;
}

const findSheet = (sheets, re) => sheets.find(s => re.test(s.name));
/** Сравнение названий: «Жилье» из чужого файла и «Жильё» в приложении — одно и то же. */
const norm = v => String(v ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const numOf = v => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

export const actions = {
  ...sphereGoalActions('money'),
  back: () => goBack('spheres'),
  tab: v => goTab('budget', 'budTab', v.v),
  prev: () => update(s => { s.ui.budMonth = addMonths(ym(), -1); }),
  next: () => update(s => { s.ui.budMonth = addMonths(ym(), 1); }),

  opadd: v => opSheet(null, v.k),
  bulk: v => bulkSheet(v.m),
  opedit: v => opSheet(B().ops.find(x => x.id === v.id)),

  catadd: v => openSheet({
    title: v.k === 'income' ? 'Статья дохода' : 'Статья расхода',
    body: field.text('name', 'Название', '', 'например, «Питомец»'),
    primary: 'Добавить',
    onSave: (val, close) => {
      const name = (val.name || '').trim();
      if (!name) return toast('Нужно название');
      const twin = nameTaken(B().cats[v.k], name);
      if (twin) return toast(`Статья «${twin.name}» уже есть`);
      upd(s => s.budget.cats[v.k].push({ id: uid(), name }));
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
        field.money('plan', 'План на месяц', planOf(m, v.k, cat.id) || ''),
        field.text('name', 'Название', cat.name),
        field.note('План задаётся на каждый месяц отдельно — в следующем он начнётся с нуля.'),
      ].join(''),
      onSave: (val, close) => {
        const name = (val.name || '').trim();
        const twin = nameTaken(B().cats[v.k], name, cat.id);
        if (twin) return toast(`Статья «${twin.name}» уже есть`);
        upd(s => {
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
        upd(s => { s.budget.cats[v.k] = s.budget.cats[v.k].filter(x => x.id !== cat.id); });
        close();
        toast(used ? 'Убрала статью, операции остались' : 'Убрала');
      },
    });
  },

  startset: () => openSheet({
    title: 'Стартовая сумма',
    sub: 'сколько было на руках, когда начался учёт',
    body: field.money('n', 'Сумма', B().start || 0),
    onSave: (v, close) => { upd(s => { s.budget.start = num(v.n); }); close(); toast('Сохранено'); },
  }),

  vaultnew: () => openSheet({
    title: 'Копилка',
    body: [
      field.text('name', 'На что', '', 'например, «Милан»'),
      field.money('start', 'Стартовая сумма', 0),
      field.note('Если в копилке уже что-то есть, впиши это здесь — дальше только пополнения и снятия.'),
    ].join(''),
    primary: 'Добавить',
    onSave: (v, close) => {
      const name = (v.name || '').trim();
      if (!name) return toast('Нужно название');
      const twin = nameTaken(B().vaults, name);
      if (twin) return toast(`Копилка «${twin.name}» уже есть`);
      upd(s => s.budget.vaults.push({ id: uid(), name, start: num(v.start) }));
      close();
    },
  }),

  vaultedit: v => {
    const vault = B().vaults.find(x => x.id === v.id);
    if (!vault) return;
    openSheet({
      title: vault.name,
      body: [
        field.text('name', 'Название', vault.name),
        field.money('start', 'Стартовая сумма', vault.start || 0),
        field.note('Сколько уже лежало в копилке до того, как начался учёт. Пополнения и снятия прибавляются к ней сверху.'),
      ].join(''),
      onSave: (val, close) => {
        upd(s => {
          const x = s.budget.vaults.find(y => y.id === vault.id);
          if (x) { x.name = (val.name || '').trim() || x.name; x.start = num(val.start); }
        });
        close();
      },
      danger: 'Удалить копилку',
      onDanger: (_val, close) => {
        upd(s => {
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
    body: field.money('n', 'Сколько', ''),
    primary: 'Снять',
    onSave: (val, close) => {
      const n = num(val.n);
      if (!n) return toast('Введи сумму');
      // Снятие — то же пополнение с минусом: копилка уменьшается, остаток растёт.
      upd(s => s.budget.ops.push({ id: uid(), kind: 'save', vaultId: v.id, sum: -n, date: todayISO(), note: 'снятие' }));
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
      upd(s => s.budget.rules.push(...lines.map(text => ({ id: uid(), text }))));
      close();
    },
  }),
  ruledel: v => upd(s => { s.budget.rules = s.budget.rules.filter(r => r.id !== v.id); }),

  /** Выгрузка задаёт и формат загрузки: тот же файл можно поправить и вернуть. */
  export: async () => {
    const b = B();
    const ops = [...b.ops].sort((a, c) => (a.date || '').localeCompare(c.date || ''));
    const vaultName = id => (b.vaults.find(v => v.id === id) || {}).name || '';

    const sheets = [
      {
        name: 'Операции',
        rows: [['Дата', 'Тип', 'Статья', 'Сумма', 'Комментарий'],
          ...ops.map(o => [o.date, KIND_RU[o.kind], o.kind === 'save' ? vaultName(o.vaultId) : catName(o.kind, o.catId), o.sum, o.note || ''])],
      },
      {
        name: 'План',
        rows: [['Месяц', 'Тип', 'Статья', 'План'],
          ...Object.keys(b.plans).sort().flatMap(m => ['expense', 'income'].flatMap(k =>
            Object.entries(b.plans[m]?.[k] || {}).map(([id, sum]) => [m, KIND_RU[k], catName(k, id), sum])))],
      },
      { name: 'Копилки', rows: [['Название', 'Стартовая сумма'], ...b.vaults.map(v => [v.name, Number(v.start) || 0])] },
    ];

    try {
      const how = await saveFile(buildXlsx(sheets), `life-os-budget-${ym()}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      if (how === 'share') toast('Отправила в «Поделиться»');
      else if (how === 'download') toast('Файл скачан');
    } catch (e) {
      toast('Не получилось выгрузить: ' + String(e.message || e).slice(0, 50));
    }
  },

  import: async () => {
    const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    toast('Читаю файл…');
    let sheets;
    try {
      sheets = await readXlsx(file);
    } catch (e) {
      return toast(String(e.message || e).slice(0, 90));
    }

    const report = [];
    try {
      upd(s => {
        const bud = s.budget;
        const catId = (kind, name) => {
          const n = String(name || '').trim();
          if (!n) return null;
          let c = bud.cats[kind].find(x => norm(x.name) === norm(n));
          if (!c) { c = { id: uid(), name: n }; bud.cats[kind].push(c); }
          return c.id;
        };
        const vaultId = name => {
          const n = String(name || '').trim() || 'Копилка';
          let v = bud.vaults.find(x => norm(x.name) === norm(n));
          if (!v) { v = { id: uid(), name: n, start: 0 }; bud.vaults.push(v); }
          return v.id;
        };

        // ── операции ──
        const opsSheet = findSheet(sheets, /операц/i);
        if (opsSheet) {
          const head = findHeader(opsSheet.rows, ['дата', 'тип', 'сумма']);
          if (head) {
            const seen = new Set(bud.ops.map(o => `${o.date}|${o.kind}|${o.sum}|${(o.note || '').trim()}`));
            let added = 0, skipped = 0;
            const colCat = head.at['статья'] ?? opsSheet.rows[head.row].findIndex(c => /стать|катег|копилк/i.test(String(c ?? '')));
            const colNote = opsSheet.rows[head.row].findIndex(c => /коммент|описан|заметк/i.test(String(c ?? '')));
            opsSheet.rows.slice(head.row + 1).forEach(r => {
              const sum = numOf(r[head.at['сумма']]);
              const kind = RU_KIND[String(r[head.at['тип']] ?? '').trim().toLowerCase()];
              let date = r[head.at['дата']];
              if (typeof date === 'number') return;              // серийная дата Excel — пропускаем, чтобы не соврать
              date = String(date ?? '').trim().slice(0, 10);
              if (!sum || !kind || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
              const note = String(r[colNote] ?? '').trim();
              const key = `${date}|${kind}|${sum}|${note}`;
              if (seen.has(key)) { skipped++; return; }
              seen.add(key);
              const name = r[colCat];
              bud.ops.push({
                id: uid(), date, kind, sum, note,
                catId: kind === 'save' ? null : catId(kind, name),
                vaultId: kind === 'save' ? vaultId(name) : null,
              });
              added++;
            });
            report.push(`операций ${added}${skipped ? `, повторов пропущено ${skipped}` : ''}`);
          }
        }

        // ── план ──
        const planSheet = findSheet(sheets, /^план$|планы/i);
        if (planSheet) {
          const head = findHeader(planSheet.rows, ['месяц', 'тип', 'статья', 'план']);
          if (head) {
            let n = 0;
            planSheet.rows.slice(head.row + 1).forEach(r => {
              const m = String(r[head.at['месяц']] ?? '').trim().slice(0, 7);
              const kind = RU_KIND[String(r[head.at['тип']] ?? '').trim().toLowerCase()];
              const sum = numOf(r[head.at['план']]);
              if (!/^\d{4}-\d{2}$/.test(m) || !kind || !sum) return;
              const id = catId(kind, r[head.at['статья']]);
              if (!id) return;
              ((bud.plans[m] ||= {})[kind] ||= {})[id] = sum;
              n++;
            });
            if (n) report.push(`планов ${n}`);
          }
        }

        // ── копилки ──
        const vaultSheet = findSheet(sheets, /копилк|сейв|накоп/i);
        if (vaultSheet) {
          const head = findHeader(vaultSheet.rows, ['назван', 'стартов']);
          if (head) {
            let n = 0;
            vaultSheet.rows.slice(head.row + 1).forEach(r => {
              const name = String(r[head.at['назван']] ?? '').trim();
              const start = numOf(r[head.at['стартов']]);
              if (!name || start == null) return;
              const v = bud.vaults.find(x => norm(x.name) === norm(name));
              if (v) v.start = start; else bud.vaults.push({ id: uid(), name, start });
              n++;
            });
            if (n) report.push(`копилок ${n}`);
          }
        }

        // ── план месяца из покупного планировщика: строка пар «статья, сумма» ──
        const ru = ['январ', 'феврал', 'март', 'апрел', 'мая|май', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
        const planner = sheets.find(x => /^план\s+\S+\s+\d{4}/i.test(x.name));
        if (planner && !report.some(r => r.startsWith('планов'))) {
          const mi = ru.findIndex(re => new RegExp(re, 'i').test(planner.name));
          const year = (planner.name.match(/\d{4}/) || [])[0];
          const row = planner.rows.find(r => r.some(c => typeof c === 'number' && c > 0) && r.some(c => typeof c === 'string'));
          if (mi >= 0 && year && row) {
            const m = `${year}-${String(mi + 1).padStart(2, '0')}`;
            let n = 0;
            for (let i = 0; i < row.length - 1; i++) {
              const name = row[i], sum = row[i + 1];
              if (typeof name !== 'string' || typeof sum !== 'number' || !sum) continue;
              if (/всего|итог/i.test(name)) continue;
              ((bud.plans[m] ||= {}).expense ||= {})[catId('expense', name)] = sum;
              n++; i++;
            }
            if (n) report.push(`план на ${m} — ${n} статей`);
          }
        }
      });
    } catch (e) {
      return toast('Не разобрала файл: ' + String(e.message || e).slice(0, 60));
    }
    toast(report.length ? 'Загружено: ' + report.join(', ') : 'Подходящих таблиц не нашлось');
  },
};
