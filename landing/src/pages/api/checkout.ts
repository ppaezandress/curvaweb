import type { APIRoute } from 'astro';
import { z } from 'zod';
import { env } from '../../lib/env';
import { rateLimit } from '../../lib/ratelimit';
import { upsertLead } from '../../lib/leads';
import { sameOrigin } from '../../lib/http';

export const prerender = false;

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  plantilla: z.string().min(1).max(80),
  nombre: z.string().max(120).optional().default(''),
  monto: z.number().nonnegative().max(1_000_000).optional().default(0),
});

// ANDAMIAJE (Pendiente #1): el proveedor de pago se conecta por env, sin tocar
// la UI. Dos modos:
//   - PLANTILLAS_CHECKOUT_URL: base de un checkout hospedado → devolvemos la URL
//     con los datos por query (la persona paga ahí, el proveedor entrega/redirige).
//   - PLANTILLAS_WEBHOOK (n8n): registramos la intención de compra y el flujo se
//     encarga del cobro + envío por correo. Devolvemos un mensaje de "ya casi".
// Si no hay ninguno, respondemos con instrucción de contacto (no rompe).

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!sameOrigin(request)) return json({ error: 'Origen no permitido' }, 403);
  let raw: unknown;
  try { raw = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'Datos inválidos. Revisa el correo.' }, 400);
  const { email, plantilla, nombre, monto } = parsed.data;

  const ip = (request.headers.get('x-forwarded-for') || clientAddress || 'unknown').split(',')[0].trim();
  const rl = await rateLimit(`checkout:ip:${ip}`, 20, 3600);
  if (!rl.ok) return json({ error: 'Demasiados intentos. Espera un momento.' }, 429);

  upsertLead(email, 'plantilla').catch(() => {});

  const checkoutBase = env('PLANTILLAS_CHECKOUT_URL');
  if (checkoutBase) {
    const url = `${checkoutBase}${checkoutBase.includes('?') ? '&' : '?'}${new URLSearchParams({ plantilla, email, monto: String(monto) })}`;
    return json({ url });
  }

  const webhook = env('PLANTILLAS_WEBHOOK') || env('PUBLIC_LEADMAGNET_WEBHOOK');
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'compra_plantilla', plantilla, nombre, monto, email, ts: new Date().toISOString() }),
      });
    } catch { /* no bloquea */ }
    return json({ ok: true, message: 'Te llegará al correo el enlace de pago y tu plantilla. ¡Gracias!' });
  }

  return json({ ok: true, message: 'Registramos tu interés. Te escribimos al correo para completar la compra.' });
};
