import { NextResponse } from "next/server";
import { getAdminSupabase, supabaseConfigured } from "@/lib/supabase/server";
import type { Proyecto } from "@/lib/reparto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Estado compartido de CURVA Socios. Protegido por el middleware Basic Auth;
// usa service role (no hay Supabase Auth en la app) → salta RLS con seguridad.

type Gasto = { n: string; m: number; proyectoId?: string | null; proveedor?: string; fecha?: string | null; esIngreso?: boolean };

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, unconfigured: true });
  const sb = getAdminSupabase();
  if (!sb) return NextResponse.json({ ok: false, unconfigured: true });
  try {
    const [proj, kv] = await Promise.all([
      sb.from("socios_project").select("id,data").order("updated_at", { ascending: true }),
      sb.from("socios_kv").select("k,v"),
    ]);
    if (proj.error || kv.error) return NextResponse.json({ ok: false, error: (proj.error || kv.error)?.message }, { status: 500 });
    const projects = (proj.data || []).map((r) => r.data as Proyecto);
    const kvMap: Record<string, unknown> = {};
    (kv.data || []).forEach((r) => { kvMap[r.k] = r.v; });
    const empty = projects.length === 0 && !kvMap.params;
    return NextResponse.json({
      ok: true, empty,
      state: {
        projects,
        gastos: (kvMap.gastos as Gasto[]) || null,
        params: kvMap.params || null,
        roster: kvMap.roster || null,
        rulesVersion: (kvMap.rulesVersion as number) ?? null,
        saldosIniciales: kvMap.saldosIniciales || null,
        banco: kvMap.banco || null,
        bitacora: kvMap.bitacora || null,
        cotConfig: kvMap.cotConfig || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

type SyncBody = {
  upsertProjects?: Proyecto[];
  deleteIds?: string[];
  params?: unknown;
  gastos?: Gasto[];
  roster?: unknown;
  rulesVersion?: number;
  saldosIniciales?: unknown;
  banco?: unknown;
  bitacora?: unknown;
  cotConfig?: unknown;
};

export async function POST(req: Request) {
  if (!supabaseConfigured()) return NextResponse.json({ ok: false, unconfigured: true });
  const sb = getAdminSupabase();
  if (!sb) return NextResponse.json({ ok: false, unconfigured: true });
  let body: SyncBody;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 }); }
  try {
    const ops: PromiseLike<{ error: unknown }>[] = [];
    if (body.upsertProjects?.length) {
      const rows = body.upsertProjects.filter((p) => p && p.id).map((p) => ({ id: p.id, data: p, updated_at: new Date().toISOString() }));
      if (rows.length) ops.push(sb.from("socios_project").upsert(rows, { onConflict: "id" }).then((r) => ({ error: r.error as unknown })));
    }
    if (body.deleteIds?.length) {
      ops.push(sb.from("socios_project").delete().in("id", body.deleteIds).then((r) => ({ error: r.error as unknown })));
    }
    const kvRows: { k: string; v: unknown; updated_at: string }[] = [];
    const now = new Date().toISOString();
    if (body.params !== undefined) kvRows.push({ k: "params", v: body.params, updated_at: now });
    if (body.gastos !== undefined) kvRows.push({ k: "gastos", v: body.gastos, updated_at: now });
    if (body.roster !== undefined) kvRows.push({ k: "roster", v: body.roster, updated_at: now });
    if (body.rulesVersion !== undefined) kvRows.push({ k: "rulesVersion", v: body.rulesVersion, updated_at: now });
    if (body.saldosIniciales !== undefined) kvRows.push({ k: "saldosIniciales", v: body.saldosIniciales, updated_at: now });
    if (body.banco !== undefined) kvRows.push({ k: "banco", v: body.banco, updated_at: now });
    if (body.bitacora !== undefined) kvRows.push({ k: "bitacora", v: body.bitacora, updated_at: now });
    if (body.cotConfig !== undefined) kvRows.push({ k: "cotConfig", v: body.cotConfig, updated_at: now });
    if (kvRows.length) ops.push(sb.from("socios_kv").upsert(kvRows, { onConflict: "k" }).then((r) => ({ error: r.error as unknown })));

    const results = await Promise.all(ops);
    const err = results.find((r) => r.error);
    if (err) return NextResponse.json({ ok: false, error: String((err.error as { message?: string })?.message || err.error) }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
