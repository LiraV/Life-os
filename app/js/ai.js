// Работа с OpenAI напрямую из браузера: сервера у приложения нет.
//
// Ключ хранится ОТДЕЛЬНО от состояния приложения и намеренно не попадает в
// экспорт: иначе он уехал бы в файл резервной копии. В репозитории ключа нет
// и быть не может — его вводит пользователь у себя на устройстве.

const KEY_STORE = 'lifeos.openai.key';
const MODEL_STORE = 'lifeos.openai.model';
export const DEFAULT_MODEL = 'gpt-4o-mini';

export const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
export const hasKey = () => getKey().trim().length > 20;
export const getModel = () => { try { return localStorage.getItem(MODEL_STORE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; } };

export function setKey(key) {
  try {
    const k = (key || '').trim();
    if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE);
  } catch (e) { console.warn('[lifeos] ключ не сохранился', e); }
}
export function setModel(model) {
  try {
    const m = (model || '').trim();
    if (m && m !== DEFAULT_MODEL) localStorage.setItem(MODEL_STORE, m); else localStorage.removeItem(MODEL_STORE);
  } catch { /* не критично */ }
}

/** Показать ключ так, чтобы было понятно «он есть», но не читался целиком. */
export const maskKey = () => {
  const k = getKey();
  return k ? `${k.slice(0, 6)}…${k.slice(-4)}` : '';
};

function humanError(status, body) {
  const msg = body?.error?.message || '';
  if (status === 401) return 'Ключ не принят — проверь, что скопирован целиком';
  if (status === 403) return 'Доступ запрещён: у ключа нет прав на эту модель';
  if (status === 404) return `Модель «${getModel()}» недоступна для этого ключа`;
  if (status === 429) return 'Слишком часто или закончился баланс на счету OpenAI';
  if (status >= 500) return 'OpenAI сейчас не отвечает, попробуй позже';
  return msg ? msg.slice(0, 120) : `Ошибка ${status}`;
}

async function callOpenAI(path, init) {
  if (!hasKey()) throw new Error('Ключ OpenAI не задан — добавь его в настройках');
  let res;
  try {
    res = await fetch('https://api.openai.com/v1' + path, {
      ...init,
      headers: { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
  } catch {
    throw new Error('Нет связи с OpenAI — проверь интернет');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(humanError(res.status, body));
  return body;
}

/** Проверка ключа: самый дешёвый запрос, который вообще есть. */
export async function checkKey() {
  const body = await callOpenAI('/models', { method: 'GET' });
  const ids = (body?.data || []).map(m => m.id);
  return { count: ids.length, hasModel: ids.includes(getModel()) };
}

/** Уменьшаем снимок перед отправкой: большие фото дороже и медленнее, а точность не растёт. */
export function shrinkImage(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), hgt = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = hgt;
      canvas.getContext('2d').drawImage(img, 0, 0, w, hgt);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось прочитать снимок')); };
    img.src = url;
  });
}

const FOOD_PROMPT = `Ты оцениваешь пищевую ценность блюда по фотографии.
Отвечай ТОЛЬКО объектом JSON вида:
{"title":"короткое название на русском","kcal":число,"prot":число,"fat":число,"carb":число,"portion":"описание порции","confidence":"low|medium|high","note":"одна фраза, что именно ты увидела"}
Числа — на всю порцию в кадре, граммы для белков, жиров и углеводов. Если блюдо непонятно, всё равно дай осторожную оценку и поставь confidence "low".`;

const num = v => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** Оценка КБЖУ по фотографии. Снимок никуда не сохраняется — уходит и забывается. */
export async function analyzeFoodPhoto(file, hint = '') {
  const dataUrl = await shrinkImage(file);
  const body = await callOpenAI('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getModel(),
      response_format: { type: 'json_object' },
      max_tokens: 400,
      messages: [
        { role: 'system', content: FOOD_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: hint ? `Подсказка от пользователя: ${hint}` : 'Оцени это блюдо.' },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
          ],
        },
      ],
    }),
  });

  const text = body?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Модель ответила не по форме — попробуй ещё раз');
  }
  return {
    title: String(parsed.title || 'Приём пищи').slice(0, 80),
    kcal: num(parsed.kcal), prot: num(parsed.prot), fat: num(parsed.fat), carb: num(parsed.carb),
    portion: String(parsed.portion || '').slice(0, 80),
    confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    note: String(parsed.note || '').slice(0, 160),
  };
}

/** Свободный вопрос Летописцу. Контекст — короткая выжимка, а не всё подряд. */
export async function askChronicler(question, context) {
  const body = await callOpenAI('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 400,
      messages: [
        {
          role: 'system',
          content: `Ты «Летописец» — спокойный помощник внутри личного приложения-планировщика.
Правила: без чувства вины и без давления; пропуск — не провал. Отвечай коротко, по-русски, на «ты», 2–4 предложения.
Опирайся на приведённые данные пользователя, не выдумывай фактов. Цели не меняешь — только предлагаешь.`,
        },
        { role: 'user', content: `Мои данные сейчас:\n${context}\n\nВопрос: ${question}` },
      ],
    }),
  });
  return String(body?.choices?.[0]?.message?.content || '').trim();
}
