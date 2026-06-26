import { getAdminSupabase } from "@/lib/supabase/server";
import { getCurvaData } from "@/lib/notion/fetchers";

// Pull ADITIVO Notion → Postgres: upsert por notion_page_id (solo escribe, no borra).
// Notion sigue siendo la fuente humana de metadata; esto llena el espejo en Postgres para
// que la analítica/el sistema de registro vivan ahí. Corre cuando 0011 está aplicado y
// existe la org. Degrada con gracia si falta algo.
export async function pullNotionToPostgres(orgId: string) {
  const sb = getAdminSupabase();
  if (!sb || !orgId) return { ok: false as const, reason: "sin-supabase-o-org" };

  try {
    const data = await getCurvaData(); // lee Notion
    const now = new Date().toISOString();

    // 1) Clientes
    if (data.clients.length) {
      await sb.from("clients").upsert(
        data.clients.map((c) => ({ org_id: orgId, notion_page_id: c.id, name: c.name, synced_at: now })),
        { onConflict: "notion_page_id" },
      );
    }
    // Mapa notion_page_id → uuid de Postgres (para las FKs de proyectos/tareas)
    const { data: cRows } = await sb.from("clients").select("id,notion_page_id").eq("org_id", orgId);
    const clientUuid: Record<string, string> = {};
    (cRows || []).forEach((r: { id: string; notion_page_id: string | null }) => { if (r.notion_page_id) clientUuid[r.notion_page_id] = r.id; });

    // 2) Proyectos
    if (data.projects.length) {
      await sb.from("projects").upsert(
        data.projects.map((p) => ({ org_id: orgId, notion_page_id: p.id, name: p.name, client_id: clientUuid[p.clientId] || null, synced_at: now })),
        { onConflict: "notion_page_id" },
      );
    }
    const { data: pRows } = await sb.from("projects").select("id,notion_page_id").eq("org_id", orgId);
    const projectUuid: Record<string, string> = {};
    (pRows || []).forEach((r: { id: string; notion_page_id: string | null }) => { if (r.notion_page_id) projectUuid[r.notion_page_id] = r.id; });

    // 3) Tareas (la metadata humana gana desde Notion)
    if (data.tasks.length) {
      await sb.from("tasks").upsert(
        data.tasks.map((t) => ({
          org_id: orgId, notion_page_id: t.id, name: t.name, status: t.status,
          type: t.typeId, weight: t.weight || null, priority: t.priority || null,
          responsable_id: t.responsableId || null, auxiliar_ids: t.auxiliarIds || [],
          client_id: clientUuid[t.clientId] || null, project_id: projectUuid[t.projectId] || null,
          due_date: t.dueDate || null, internal: !!t.internal, baseline_seconds: t.baselineSeconds || 0,
          updated_at: now, synced_at: now,
        })),
        { onConflict: "notion_page_id" },
      );
    }

    await sb.from("sync_state").upsert(
      { org_id: orgId, resource: "tasks", last_synced_at: now, status: "ok" },
      { onConflict: "org_id,resource" },
    );

    return { ok: true as const, clients: data.clients.length, projects: data.projects.length, tasks: data.tasks.length };
  } catch (e) {
    return { ok: false as const, reason: String(e) };
  }
}
