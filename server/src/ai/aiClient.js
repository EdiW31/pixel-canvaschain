// Shared OpenAI client wrapper. If OPENAI_API_KEY is missing, getClient()
// returns null so the app stays runnable in dev without a key.
import OpenAI from 'openai';

const VISION_MODEL = process.env.AI_VISION_MODEL || 'gpt-4o';
const IMAGE_MODEL  = process.env.AI_IMAGE_MODEL  || 'gpt-image-1';

let _client = null;
function getClient() {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  _client = new OpenAI({ apiKey: key });
  return _client;
}

export function isAIAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

// Caption PNG bytes using a vision-capable chat model; returns plain text.
export async function vision(imageBuffer, prompt, opts = {}) {
  const client = getClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');
  const b64 = imageBuffer.toString('base64');
  const res = await client.chat.completions.create({
    model: VISION_MODEL,
    max_tokens: opts.maxTokens ?? 120,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
  });
  return (res.choices?.[0]?.message?.content ?? '').trim();
}

// Generate a PNG from a text prompt (gpt-image-1 returns base64 PNG).
export async function generateImage({ prompt, size = '1024x1024' }) {
  const client = getClient();
  if (!client) throw new Error('OPENAI_API_KEY not set');
  const res = await client.images.generate({
    model: IMAGE_MODEL,
    prompt,
    size,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image API returned no image data');
  return Buffer.from(b64, 'base64');
}
