// Работа с OpenAI напрямую из браузера: сервера у приложения нет.
//
// Ключ хранится ОТДЕЛЬНО от состояния приложения и намеренно не попадает в
// экспорт: иначе он уехал бы в файл резервной копии. В репозитории ключа нет
// и быть не может — его вводит пользователь у себя на устройстве.

const KEY_STORE = 'lifeos.openai.key';
const MODEL_STORE = 'lifeos.openai.model';
const LIST_STORE = 'lifeos.openai.models';
export const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Список моделей берём у самого OpenAI, а не пишем руками: написанный руками
 * устаревает молча, и человек выбирает из того, чего у него нет. Отсеиваем то,
 * что не умеет разговаривать: озвучку, картинки, распознавание речи, векторы.
 */
const CHATTY = id => /^(gpt|o\d|chatgpt)/i.test(id)
  && !/(embedding|whisper|tts|audio|realtime|image|dall|moderation|transcribe|search|codex)/i.test(id);

export const knownModels = () => {
  try {
    const list = JSON.parse(localStorage.getItem(LIST_STORE) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};

const rememberModels = ids => {
  try {
    localStorage.setItem(LIST_STORE, JSON.stringify(ids.filter(CHATTY).sort()));
  } catch { /* не критично: список — удобство, а не данные */ }
};

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
  const ids = await fetchModels();
  return { count: ids.length, hasModel: ids.includes(getModel()) };
}

/** Спросить у OpenAI, какие модели доступны этому ключу, и запомнить список. */
export async function fetchModels() {
  const body = await callOpenAI('/models', { method: 'GET' });
  const ids = (body?.data || []).map(m => m.id);
  rememberModels(ids);
  return ids;
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

const FOOD_PROMPT = `Ты оцениваешь пищевую ценность блюда по фотографии или по словесному описанию.
Отвечай ТОЛЬКО объектом JSON вида:
{"title":"короткое название на русском","kcal":число,"prot":число,"fat":число,"carb":число,"portion":"описание порции","confidence":"low|medium|high","note":"одна фраза, из чего сложилась оценка"}
Числа — на всю съеденную порцию, граммы для белков, жиров и углеводов.
Если размер порции не указан, бери обычную бытовую порцию и скажи об этом в portion.
Если блюдо описано расплывчато, всё равно дай осторожную оценку и поставь confidence "low".`;

const num = v => {
  const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/** Разбор ответа модели: форму держим одинаковой и для фото, и для описания. */
function parseFood(body) {
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

const foodRequest = content => ({
  method: 'POST',
  body: JSON.stringify({
    model: getModel(),
    response_format: { type: 'json_object' },
    max_tokens: 400,
    messages: [{ role: 'system', content: FOOD_PROMPT }, { role: 'user', content }],
  }),
});

/** Оценка КБЖУ по фотографии. Снимок никуда не сохраняется — уходит и забывается. */
export async function analyzeFoodPhoto(file, hint = '') {
  const dataUrl = await shrinkImage(file);
  return parseFood(await callOpenAI('/chat/completions', foodRequest([
    { type: 'text', text: hint ? `Подсказка от пользователя: ${hint}` : 'Оцени это блюдо.' },
    { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
  ])));
}

/** Оценка КБЖУ по словесному описанию: «тарелка борща и два куска хлеба». */
export async function analyzeFoodText(description) {
  const text = String(description || '').trim();
  if (!text) throw new Error('Опиши, что ели');
  return parseFood(await callOpenAI('/chat/completions', foodRequest(`Оцени: ${text}`)));
}

const CHRONICLER = `Ты «Летописец» — спокойный собеседник внутри личного приложения-планировщика.
С тобой обсуждают жизнь: усталость, планы, сомнения, отношения, работу, учёбу.

Как говоришь:
— по-русски, на «ты», живо и без канцелярита; обычно 2–5 предложений, но если разговор серьёзный, можно длиннее;
— без чувства вины и без бодрого коучинга: пропуск — не провал, отдых — не лень;
— не сыплешь советами сразу. Сначала пойми, что человек имеет в виду: уточняющий вопрос часто полезнее плана;
— опираешься на приведённые данные, но не пересказываешь их без нужды и не выдумываешь фактов;
— ничего не меняешь в приложении сам: можешь предложить, решает человек;
— пол собеседника указан в данных: обращайся в этом роде и не переспрашивай о нём.

Границы: ты не врач и не терапевт. Диагнозов не ставишь, лекарств не назначаешь. Если речь о серьёзном —
о том, что тянется давно, пугает или про безопасность, — честно скажи, что тут нужен живой человек:
свой психиатр или терапевт, близкие. Не читай нотаций и не отказывайся говорить: просто будь рядом.`;

/**
 * Беседа с Летописцем. Отправляется вся нить, чтобы разговор помнил себя,
 * и выжимка данных — ровно та, что перечислена на экране.
 */
export async function chatChronicler(history, context, extra = '') {
  const thread = (history || []).slice(-16).map(m => ({
    role: m.who === 'ai' ? 'assistant' : 'user',
    content: String(m.text || '').slice(0, 2000),
  }));
  const body = await callOpenAI('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 700,
      messages: [
        { role: 'system', content: CHRONICLER },
        { role: 'system', content: `Данные пользователя на сейчас:\n${context}${extra ? `\n\nПоследние записи дневника:\n${extra}` : ''}` },
        ...thread,
      ],
    }),
  });
  return String(body?.choices?.[0]?.message?.content || '').trim();
}
