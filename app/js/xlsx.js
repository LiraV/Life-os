// Минимальный писатель .xlsx: zip без сжатия плюс XML листов.
// Библиотек в проекте нет, а настоящая книга открывается и в Excel, и в Numbers
// на телефоне — в отличие от CSV, который iOS показывает текстом.

// Экранирование берём из ui.js: оно было здесь слово в слово, а править такое
// в двух местах — верный способ разъехаться.
import { esc } from './ui.js';

const enc = new TextEncoder();

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Дата и время в формате MS-DOS — их требует заголовок записи zip. */
function dosStamp(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

class Buf {
  constructor() { this.parts = []; this.len = 0; }
  push(bytes) { this.parts.push(bytes); this.len += bytes.length; }
  u16(n) { this.push(new Uint8Array([n & 255, (n >> 8) & 255])); }
  u32(n) { this.push(new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255])); }
  bytes() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

/** Сборка zip без сжатия: для XML такого размера сжатие не окупается. */
function zip(files, now = new Date()) {
  const { time, date } = dosStamp(now);
  const out = new Buf();
  const central = [];

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    const offset = out.len;

    out.u32(0x04034b50);
    out.u16(20); out.u16(0x0800); out.u16(0);   // версия, флаг UTF-8, метод «без сжатия»
    out.u16(time); out.u16(date);
    out.u32(crc); out.u32(data.length); out.u32(data.length);
    out.u16(name.length); out.u16(0);
    out.push(name); out.push(data);

    central.push({ name, crc, size: data.length, offset });
  }

  const dirStart = out.len;
  for (const c of central) {
    out.u32(0x02014b50);
    out.u16(20); out.u16(20); out.u16(0x0800); out.u16(0);
    out.u16(time); out.u16(date);
    out.u32(c.crc); out.u32(c.size); out.u32(c.size);
    out.u16(c.name.length); out.u16(0); out.u16(0);
    out.u16(0); out.u16(0); out.u32(0);
    out.u32(c.offset);
    out.push(c.name);
  }
  const dirSize = out.len - dirStart;

  out.u32(0x06054b50);
  out.u16(0); out.u16(0);
  out.u16(central.length); out.u16(central.length);
  out.u32(dirSize); out.u32(dirStart);
  out.u16(0);

  return out.bytes();
}


/** Номер колонки в буквенную адресацию: 1 → A, 27 → AA. */
function colName(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Имя листа: Excel запрещает : \ / ? * [ ] и больше 31 знака. */
const safeSheetName = (name, i) => (String(name).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || `Лист${i + 1}`);

function sheetXml(rows) {
  const body = rows.map((row, r) => {
    const cells = row.map((val, c) => {
      const ref = `${colName(c + 1)}${r + 1}`;
      if (val == null || val === '') return '';
      if (typeof val === 'number' && Number.isFinite(val)) return `<c r="${ref}"><v>${val}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Собрать книгу. sheets — [{ name, rows: [[значение, …], …] }].
 * Числа пишутся числами, всё остальное — строками.
 */
export function buildXlsx(sheets) {
  const names = sheets.map((s, i) => safeSheetName(s.name, i));

  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${
        sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
        names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
        names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ];

  return zip(files);
}

// ── чтение книги ────────────────────────────────────────────────
//
// Распаковку делает сам браузер через DecompressionStream: писать inflate
// руками ради этого не стоит, а поддержка есть везде, где живёт приложение.

const dv = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u16 = (b, o) => dv(b).getUint16(o, true);
const u32 = (b, o) => dv(b).getUint32(o, true);

function findEOCD(b) {
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (u32(b, i) === 0x06054b50) return i;
  }
  throw new Error('Это не файл Excel — не нашлась структура архива');
}

/** Записи архива: имя → способ сжатия и границы данных. */
function zipEntries(b) {
  const eocd = findEOCD(b);
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const dataAt = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    out.set(name, { method, start: dataAt, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readEntry(b, e) {
  const raw = b.subarray(e.start, e.start + e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Браузер не умеет распаковывать этот файл — обнови его или пришли CSV');
  }
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const colOf = ref => {
  let n = 0;
  for (const ch of (ref.match(/[A-Z]+/) || ['A'])[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

/**
 * Прочитать книгу: [{ name, rows }], где rows — массив массивов.
 * Числа приходят числами, формулы — своим последним значением.
 */
export async function readXlsx(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  const entries = zipEntries(b);
  const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
  const need = name => {
    const e = entries.get(name);
    if (!e) throw new Error(`В файле нет ${name}`);
    return readEntry(b, e);
  };

  const shared = [];
  if (entries.has('xl/sharedStrings.xml')) {
    const doc = parse(await need('xl/sharedStrings.xml'));
    doc.querySelectorAll('si').forEach(si => {
      shared.push([...si.querySelectorAll('t')].map(t => t.textContent).join(''));
    });
  }

  const relDoc = parse(await need('xl/_rels/workbook.xml.rels'));
  const rels = {};
  relDoc.querySelectorAll('Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });

  const wb = parse(await need('xl/workbook.xml'));
  const sheets = [];
  for (const sh of wb.querySelectorAll('sheet')) {
    const id = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = rels[id] || '';
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    if (!entries.has(path)) continue;

    const doc = parse(await readEntry(b, entries.get(path)));
    const rows = [];
    doc.querySelectorAll('row').forEach(row => {
      const cells = {};
      row.querySelectorAll('c').forEach(c => {
        const t = c.getAttribute('t');
        const vEl = c.querySelector('v');
        let val = null;
        if (t === 's' && vEl) val = shared[Number(vEl.textContent)] ?? '';
        else if (t === 'inlineStr') val = [...c.querySelectorAll('t')].map(x => x.textContent).join('');
        else if (t === 'e') val = null;                       // #REF! и прочие ошибки пропускаем
        else if (vEl) { const n = Number(vEl.textContent); val = Number.isFinite(n) ? n : vEl.textContent; }
        if (val !== null && val !== '') cells[colOf(c.getAttribute('r') || 'A')] = val;
      });
      const width = Math.max(0, ...Object.keys(cells).map(Number));
      rows.push(Array.from({ length: width }, (_, i) => cells[i + 1] ?? null));
    });
    sheets.push({ name: sh.getAttribute('name') || 'Лист', rows });
  }
  return sheets;
}

/** Выбор файла с диска — общий для всех мест, где что-то загружается. */
export function pickFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

/**
 * Отдать файл пользователю. На телефоне ссылка-скачивание часто не работает,
 * поэтому сначала пробуем системный «Поделиться», а уже потом обычную ссылку.
 */
export async function saveFile(bytes, filename, mime) {
  const file = new File([bytes], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'share';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  return 'download';
}
