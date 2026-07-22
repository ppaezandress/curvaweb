import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { logError } from "@/lib/observability";
import { rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Buzón de errores del NAVEGADOR. La mitad de los fallos que de verdad afectan al equipo no
// ocurren en el servidor: el POST del cronómetro que no sale porque no hay red, el registro
// manual que revienta. Antes eso solo existía en la consola de la persona (o sea: no existía).
//
// Solo acepta sesiones autenticadas y está limitado por usuario: un bucle de reintentos en un
// navegador no puede inundar la bitácora.
const ClientErrorSchema = z.object({
  scope: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth.ok) return auth.response;

  const rl = await rateLimit(`client-error:${auth.user.id}`, { limit: 20, windowSec: 300 });
  if (!rl.ok) return tooMany(rl.retryAfter);

  const parsed = ClientErrorSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { scope, message, meta } = parsed.data;
  await logError(`client/${scope}`, message, {
    ...meta,
    userId: auth.user.id,
    userAgent: req.headers.get("user-agent") || undefined,
  });
  return NextResponse.json({ ok: true });
}
