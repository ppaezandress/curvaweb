import type { APIRoute } from 'astro';
import { transcribeAudio, llmConfigured } from '../../lib/llm';
import { rateLimit } from '../../lib/ratelimit';
import { sameOrigin } from '../../lib/http';

export const prerender = false;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const OK_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', ''];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return json({ error: 'Origen no permitido' }, 403);
  // clientAddress = IP confiable de Vercel; el x-forwarded-for del cliente es
  // falsificable, solo de respaldo tomando el valor más a la derecha.
  const ip = (clientAddress || request.headers.get('x-forwarded-for')?.split(',').pop() || 'unknown').trim();
  const rl = await rateLimit(`transcribe:ip:${ip}`, 40, 3600);
  if (!rl.ok) return json({ error: 'Demasiados audios en poco tiempo.' }, 429);

  if (!llmConfigured()) return json({ error: 'Transcripción no disponible ahora mismo.' }, 503);

  let file: Blob | null = null;
  try {
    const form = await request.formData();
    const f = form.get('audio');
    if (f instanceof Blob) file = f;
  } catch {
    return json({ error: 'No pude leer el audio.' }, 400);
  }
  if (!file) return json({ error: 'Falta el audio.' }, 400);
  if (file.size > MAX_BYTES) return json({ error: 'El audio es demasiado largo.' }, 413);
  if (!OK_TYPES.includes(file.type)) return json({ error: 'Formato de audio no soportado.' }, 415);

  try {
    const audio = new Uint8Array(await file.arrayBuffer());
    const text = await transcribeAudio(audio);
    return json({ text: (text || '').trim() });
  } catch (e) {
    console.error('[transcribe] error:', (e as Error).message);
    return json({ error: 'No pude transcribir el audio. Escríbelo mejor.' }, 200);
  }
};
