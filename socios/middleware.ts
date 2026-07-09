import { NextResponse, type NextRequest } from "next/server";

// Candado de acceso para CURVA Socios (data financiera interna: reparto + CRM).
// El plan de Vercel no permite "Vercel Authentication" en producción, así que
// protegemos TODO el sitio con HTTP Basic Auth. Las credenciales viven en env
// (SOCIOS_USER / SOCIOS_PASS) — nunca en el código. Sin ellas, se niega el paso.
//
// Cubre páginas y /api/*. Deja pasar solo los assets estáticos de Next para que
// el navegador pueda renderizar la pantalla de login sin fugar nada sensible.

const USER = process.env.SOCIOS_USER || "";
const PASS = process.env.SOCIOS_PASS || "";

// Comparación en tiempo ~constante para no filtrar longitud/prefijo por timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Acceso restringido — CURVA Socios", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CURVA Socios", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  // Si no hay credenciales configuradas, fallar CERRADO (nunca abrir por accidente).
  if (!USER || !PASS) return unauthorized();

  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized();
  }
  const idx = decoded.indexOf(":");
  const u = idx >= 0 ? decoded.slice(0, idx) : "";
  const p = idx >= 0 ? decoded.slice(idx + 1) : "";

  if (safeEqual(u, USER) && safeEqual(p, PASS)) return NextResponse.next();
  return unauthorized();
}

// Protege todo excepto los assets internos de Next y el favicon.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
