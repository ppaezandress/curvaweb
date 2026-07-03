// Guard same-origin para los endpoints POST: bloquea peticiones cross-site
// (CSRF-ish) y bots ingenuos. No es auth — es defensa en profundidad junto al
// rate-limit y el gate de correo. Origin ausente se permite (mismo-sitio).
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // navegadores omiten Origin en algunos same-origin
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
