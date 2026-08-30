// Функция для Yandex Cloud Functions: хранит состояние планера одним файлом
// в Object Storage и пускает к нему только его хозяина.
//
// Один файл и ни одной зависимости — намеренно: так её можно вставить прямо в
// редактор в консоли, без сборки, zip-архивов и npm. Подпись запросов к
// хранилищу написана здесь же, внизу: это сорок строк, и они не меняются.
//
// Кто вошёл — спрашиваем у Яндекса по присланному токену. Токен приходит от
// браузера и ничем больше не подтверждён, поэтому верить ему на слово нельзя:
// каждый раз ходим за именем хозяина к login.yandex.ru, и только полученный
// оттуда идентификатор решает, какой файл открыть.

const crypto = require('crypto');

const BUCKET = process.env.BUCKET;
const KEY_ID = process.env.KEY_ID;
const SECRET = process.env.SECRET;
const HOST = 'storage.yandexcloud.net';
const REGION = 'ru-central1';

const CORS = {
  'Access-Control-Allow-Origin': process.env.ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const reply = (code, body) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', ...CORS },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const method = event.httpMethod || 'GET';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const auth = (event.headers?.Authorization || event.headers?.authorization || '').trim();
  const token = auth.replace(/^(OAuth|Bearer)\s+/i, '');
  if (!token) return reply(401, { error: 'нет токена' });

  let who;
  try {
    who = await whoIs(token);
  } catch (e) {
    return reply(401, { error: 'вход не подтвердился' });
  }

  const key = `state/${who.id}.json`;
  try {
    if (method === 'GET') {
      const found = await s3('GET', key);
      return reply(200, { account: who, data: found ? JSON.parse(found) : null });
    }
    if (method === 'POST') {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64').toString('utf8')
        : (event.body || '');
      const parsed = JSON.parse(raw);
      // Пустое состояние не принимаем: это почти всегда сбой на стороне
      // устройства, а записать его поверх целого — потерять всё разом.
      if (!parsed || typeof parsed !== 'object' || !parsed.user) return reply(400, { error: 'это не состояние' });
      await s3('PUT', key, JSON.stringify(parsed));
      return reply(200, { ok: true });
    }
  } catch (e) {
    return reply(500, { error: String(e && e.message ? e.message : e) });
  }
  return reply(405, { error: 'так нельзя' });
};

/** Кто прислал токен. Единственный источник правды о хозяине данных. */
function whoIs(token) {
  return new Promise((resolve, reject) => {
    const req = require('https').request({
      host: 'login.yandex.ru', path: '/info?format=json', method: 'GET',
      headers: { Authorization: `OAuth ${token}` },
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Яндекс ответил ${res.statusCode}`));
        try {
          const j = JSON.parse(body);
          if (!j.id) return reject(new Error('без идентификатора'));
          resolve({ id: String(j.id), login: j.login || '', email: j.default_email || '' });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── хранилище ───────────────────────────────────────────────────
// Object Storage говорит на языке S3, поэтому запрос надо подписать. Подпись
// делается по одному и тому же рецепту с 2014 года и здесь не меняется.

const sha256 = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
const hmac = (k, x) => crypto.createHmac('sha256', k).update(x, 'utf8').digest();

function s3(method, key, body = '') {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const path = `/${BUCKET}/${key}`;
  const hash = sha256(body);

  const canonical = [
    method, path, '',
    `host:${HOST}`, `x-amz-content-sha256:${hash}`, `x-amz-date:${amzDate}`, '',
    'host;x-amz-content-sha256;x-amz-date', hash,
  ].join('\n');

  const scope = `${day}/${REGION}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signing = hmac(hmac(hmac(hmac(`AWS4${SECRET}`, day), REGION), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', signing).update(toSign, 'utf8').digest('hex');

  const headers = {
    Host: HOST,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': hash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${KEY_ID}/${scope}, `
      + 'SignedHeaders=host;x-amz-content-sha256;x-amz-date, '
      + `Signature=${signature}`,
  };
  if (method === 'PUT') {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise((resolve, reject) => {
    const req = require('https').request({ host: HOST, path, method, headers }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        // Файла ещё нет — это не ошибка, а «человек только что завёлся».
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode >= 300) return reject(new Error(`хранилище ответило ${res.statusCode}`));
        resolve(method === 'GET' ? out : true);
      });
    });
    req.on('error', reject);
    if (method === 'PUT') req.write(body);
    req.end();
  });
}
