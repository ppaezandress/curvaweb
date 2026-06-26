import { NextResponse } from "next/server";
import { getCurvaData } from "@/lib/notion/fetchers";
import { getCurvaDataFromPostgres } from "@/lib/pg/fetchers";
import { notionConfigured } from "@/lib/notion/client";
import { DATA_SOURCE } from "@/lib/source";
import { members, clients, projects, tasks, taskTypes } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

function mockPayload() {
  return { members, clients, projects, tasks, taskTypes };
}

export async function GET(req: Request) {
  // Override por query (?source=postgres) para validar sin flipear el flag global.
  const override = new URL(req.url).searchParams.get("source");
  const source = override === "postgres" || override === "notion" ? override : DATA_SOURCE;

  // Doble-lectura: en modo postgres lee del espejo; si está vacío o falla, cae a Notion.
  if (source === "postgres") {
    try {
      const data = await getCurvaDataFromPostgres();
      if (data && data.tasks.length) return NextResponse.json({ source: "postgres", ...data });
    } catch { /* degradación con gracia → Notion */ }
  }

  if (!notionConfigured()) {
    return NextResponse.json({ source: "mock", ...mockPayload() });
  }
  try {
    const data = await getCurvaData();
    return NextResponse.json({ source: "notion", ...data });
  } catch (e) {
    // Resiliencia: si Notion falla, la app sigue con datos de prueba.
    return NextResponse.json({ source: "mock", error: String(e), ...mockPayload() });
  }
}
