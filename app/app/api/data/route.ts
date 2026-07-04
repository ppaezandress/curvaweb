import { NextResponse } from "next/server";
import { getCurvaData } from "@/lib/notion/fetchers";
import { getCurvaDataFromPostgres } from "@/lib/pg/fetchers";
import { notionConfigured } from "@/lib/notion/client";
import { DATA_SOURCE } from "@/lib/source";
import { members, clients, projects, tasks, taskTypes } from "@/lib/mock-data";
import { requireSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

function mockPayload() {
  return { members, clients, projects, tasks, taskTypes };
}

// No exponemos los correos del equipo en la respuesta (privacidad). La validación que
// los necesita (registro) lee el roster server-side directo de Notion, no de aquí.
function publicSafe(d: { members: { email?: string }[] } & Record<string, unknown>) {
  return { ...d, members: (d.members || []).map((m) => ({ ...m, email: "" })) };
}

export async function GET(req: Request) {
  // Es data de negocio interna (clientes, proyectos, carga por persona) → exige sesión.
  const auth = await requireSession();
  if (!auth.ok) return auth.response;
  // Override por query (?source=postgres) para validar sin flipear el flag global.
  const override = new URL(req.url).searchParams.get("source");
  const source = override === "postgres" || override === "notion" ? override : DATA_SOURCE;

  // Doble-lectura: en modo postgres lee del espejo; si está vacío o falla, cae a Notion.
  if (source === "postgres") {
    try {
      const data = await getCurvaDataFromPostgres();
      if (data && data.tasks.length) return NextResponse.json({ source: "postgres", ...publicSafe(data) });
    } catch { /* degradación con gracia → Notion */ }
  }

  if (!notionConfigured()) {
    return NextResponse.json({ source: "mock", ...publicSafe(mockPayload()) });
  }
  try {
    const data = await getCurvaData();
    return NextResponse.json({ source: "notion", ...publicSafe(data) });
  } catch {
    // Resiliencia: si Notion falla, la app sigue con datos de prueba.
    return NextResponse.json({ source: "mock", ...publicSafe(mockPayload()) });
  }
}
