import { NextResponse } from "next/server";
import { getCurvaData } from "@/lib/notion/fetchers";
import { notionConfigured } from "@/lib/notion/client";
import { members, clients, projects, tasks, taskTypes } from "@/lib/mock-data";

export const dynamic = "force-dynamic";

function mockPayload() {
  return { members, clients, projects, tasks, taskTypes };
}

export async function GET() {
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
