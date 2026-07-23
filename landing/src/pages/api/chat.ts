import type { APIRoute } from 'astro';
import { z } from 'zod';
import { generateChat, llmConfigured, type ChatMessage } from '../../lib/llm';
import { buildSystemPrompt, CAL_LINK } from '../../lib/knowledge';
import { rateLimit } from '../../lib/ratelimit';
import { upsertLead, saveMessage } from '../../lib/leads';
import { sameOrigin } from '../../lib/http';

export const prerender = false;

// Validación de entrada con Zod (input-validation).
const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(1500) }))
    .min(1)
    .max(16),
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return json({ error: 'Origen no permitido' }, 403);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Datos inválidos. Revisa tu correo y tu mensaje.' }, 400);
  const { email, messages } = parsed.data;
  if (messages[messages.length - 1].role !== 'user') return json({ error: 'Falta tu mensaje.' }, 400);

  // Anti-abuso: por correo y por IP. Usamos clientAddress (IP confiable que
  // inyecta Vercel); el x-forwarded-for del cliente es falsificable, así que
  // solo lo usamos de respaldo tomando el valor MÁS a la derecha (el que añade
  // el proxy de Vercel), no el de más a la izquierda que controla el atacante.
  const ip = (clientAddress || request.headers.get('x-forwarded-for')?.split(',').pop() || 'unknown').trim();
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`chat:email:${email}`, 30, 3600),
    rateLimit(`chat:ip:${ip}`, 60, 3600),
  ]);
  if (!byEmail.ok || !byIp.ok) {
    return json({ reply: 'Llevamos varias en poco tiempo. Mejor agenda una llamada y lo vemos con calma.', cta: 'schedule', calLink: CAL_LINK }, 429);
  }

  // Guarda el lead y su último mensaje (no bloquea la respuesta si falla).
  const lastUser = messages[messages.length - 1].content;
  upsertLead(email, 'chat').then(() => saveMessage(email, 'user', lastUser)).catch(() => {});

  // Sin LLM configurado: respuesta útil de respaldo (no rompe la experiencia).
  if (!llmConfigured()) {
    return json({ reply: 'Gracias por contarme. Para darte la mejor ruta, agenda una llamada de 30 minutos y lo vemos a detalle.', cta: 'schedule', calLink: CAL_LINK });
  }

  try {
    const full: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt() }, ...messages];
    const out = await generateChat(full);

    const links = (out.links || []).filter((l) => l.href.startsWith('/')).slice(0, 3);
    saveMessage(email, 'assistant', out.reply).catch(() => {});
    return json({
      reply: out.reply.slice(0, 1200),
      options: out.options?.slice(0, 4),
      links: links.length ? links : undefined,
      cta: out.cta === 'schedule' ? 'schedule' : undefined,
      calLink: CAL_LINK,
    });
  } catch (e) {
    console.error('[chat] error:', (e as Error).message);
    return json({ reply: 'Se me trabó algo de mi lado. Agenda una llamada y lo vemos directo.', cta: 'schedule', calLink: CAL_LINK });
  }
};
