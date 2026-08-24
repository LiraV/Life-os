// Минимальный писатель .xlsx: zip без сжатия плюс XML листов.
// Библиотек в проекте нет, а настоящая книга открывается и в Excel, и в Numbers
// на телефоне — в отличие от CSV, который iOS показывает текстом.

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

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

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
