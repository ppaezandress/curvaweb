import { NextResponse } from "next/server";
import { getClientes, notionConfigured } from "@/lib/notion";

export const runtime = "nodejs";
export const revalidate = 60;

// Clientes/leads del CRM de Notion — alimentan el dropdown "¿a qué cliente/proyecto?".
export async function GET() {
  if (!notionConfigured()) return NextResponse.json({ ok: true, clientes: [], notion: false });
  try {
    const clientes = await getClientes();
    return NextResponse.json({ ok: true, clientes, notion: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, clientes: [] }, { status: 500 });
  }
}
