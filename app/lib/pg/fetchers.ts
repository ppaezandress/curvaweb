import { getServerSupabase } from "@/lib/supabase/server";
import type { Member, Client, Project, Task, TaskType } from "@/lib/mock-data";

// Lee la misma forma que getCurvaData() pero desde Postgres (el espejo sincronizado).
// CLAVE: mantiene los ids = notion_page_id, así TODOS los caminos de escritura
// (/api/tasks, /api/time-entries → Notion) siguen funcionando sin cambios. Los uuids de
// Postgres son solo llaves internas de join. Default sigue siendo Notion; esto se activa
// por flag o por ?source=postgres (para validar).

const MEMBER_COLORS = ["var(--color-curva-teal)", "var(--color-curva-blue)", "var(--color-curva-purple)", "var(--color-curva-indigo)", "var(--color-curva-pink)"];
const TYPE_COLORS = ["var(--color-curva-purple)", "var(--color-curva-blue)", "var(--color-curva-teal)", "var(--color-curva-pink)", "var(--color-curva-indigo)"];
const initials = (n: string) => { const p = (n || "").trim().split(/\s+/); return (!p[0] ? "?" : p.length === 1 ? p[0][0] : p[0][0] + p[1][0]).toUpperCase(); };
const prettyType = (slug: string) => (slug || "sin-tipo").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

type CRow = { id: string; notion_page_id: string | null; name: string };
type PRow = { id: string; notion_page_id: string | null; name: string; client_id: string | null };
type TRow = {
  notion_page_id: string | null; name: string; status: string | null; type: string | null;
  weight: string | null; priority: string | null; responsable_id: string | null; auxiliar_ids: string[] | null;
  client_id: string | null; project_id: string | null; due_date: string | null; internal: boolean | null;
  baseline_seconds: number | null; created_at: string | null;
};
type ORow = { notion_user_id: string | null; name: string | null; email: string | null };

export async function getCurvaDataFromPostgres(): Promise<{ members: Member[]; clients: Client[]; projects: Project[]; tasks: Task[]; taskTypes: TaskType[] } | null> {
  const sb = await getServerSupabase();
  if (!sb) return null;

  const [{ data: cRows }, { data: pRows }, { data: tRows }, { data: oRows }] = await Promise.all([
    sb.from("clients").select("id,notion_page_id,name"),
    sb.from("projects").select("id,notion_page_id,name,client_id"),
    sb.from("tasks").select("notion_page_id,name,status,type,weight,priority,responsable_id,auxiliar_ids,client_id,project_id,due_date,internal,baseline_seconds,created_at"),
    sb.from("org_people").select("notion_user_id,name,email"),
  ]);
  if (!tRows) return null;

  // uuid → notion_page_id (para que clientId/projectId queden en el espacio de ids de Notion)
  const cNotion: Record<string, string> = {}; const clients: Client[] = [];
  (cRows as CRow[] | null || []).forEach((c) => { if (c.notion_page_id) { cNotion[c.id] = c.notion_page_id; clients.push({ id: c.notion_page_id, name: c.name, phase: "—", status: "—" as Client["status"] }); } });
  const pNotion: Record<string, string> = {}; const projects: Project[] = [];
  (pRows as PRow[] | null || []).forEach((p) => { if (p.notion_page_id) { pNotion[p.id] = p.notion_page_id; projects.push({ id: p.notion_page_id, name: p.name, clientId: p.client_id ? cNotion[p.client_id] || "" : "" }); } });

  const typeSet = new Set<string>();
  const tasks: Task[] = (tRows as TRow[]).filter((t) => t.notion_page_id).map((t) => {
    const typeId = t.type || "sin-tipo"; typeSet.add(typeId);
    const resp = t.responsable_id || "";
    const aux = (t.auxiliar_ids || []).filter(Boolean);
    return {
      id: t.notion_page_id!, name: t.name || "(sin nombre)",
      responsableId: resp, auxiliarId: aux[0] || undefined,
      responsableIds: resp ? [resp] : [], auxiliarIds: aux,
      clientId: t.client_id ? cNotion[t.client_id] || "" : "", projectId: t.project_id ? pNotion[t.project_id] || "" : "",
      typeId, status: t.status || "Sin empezar", baselineSeconds: t.baseline_seconds || 0,
      weight: (t.weight || undefined) as Task["weight"], priority: (t.priority || undefined) as Task["priority"],
      internal: !!t.internal, dueDate: t.due_date || undefined, createdAt: t.created_at || undefined,
    };
  });

  // Miembros: roster COMPLETO (todos los asignados, tengan cuenta o no). id = notion_user_id (matchea responsableId).
  const members: Member[] = (oRows as ORow[] | null || []).filter((o) => o.notion_user_id).map((o, i) => ({
    id: o.notion_user_id!, name: o.name || "—", short: initials(o.name || ""),
    role: o.email || "Equipo CURVA", email: o.email || "", color: MEMBER_COLORS[i % MEMBER_COLORS.length],
  }));

  const taskTypes: TaskType[] = [
    { id: "sin-tipo", label: "Sin tipo", color: "var(--color-ink-soft)" },
    ...[...typeSet].filter((t) => t !== "sin-tipo").map((id, i) => ({ id, label: prettyType(id), color: TYPE_COLORS[i % TYPE_COLORS.length] })),
  ];

  return { members, clients, projects, tasks, taskTypes };
}
