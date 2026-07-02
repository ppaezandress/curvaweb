"use client";

import { useMemo, useState } from "react";
import { ListTodo, Users, Building2, Search, Inbox, Check, Building, CalendarClock, CircleDot, Plus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { type Task } from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";
import { TaskCard } from "@/components/TaskCard";
import { NewTaskModal } from "@/components/NewTaskModal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { isAssignedTo, isDone } from "@/lib/task-status";
import { dueDateMs } from "@/lib/date";

type View = "mine" | "all";
type Group = "cliente" | "urgencia" | "estado";
const NO_CLIENT = "__sin_cliente__";
const INTERNAL = "__interno__";
const DAY = 86_400_000;

const URGENCY = [
  { key: "vencidas", label: "Vencidas", bar: "bg-rose-500" },
  { key: "hoy", label: "Para hoy", bar: "bg-accent" },
  { key: "semana", label: "Próximos 7 días", bar: "bg-curva-indigo" },
  { key: "despues", label: "Más adelante", bar: "bg-curva-teal" },
  { key: "nofecha", label: "Sin fecha", bar: "bg-zinc-400" },
] as const;
const STATUS_ORDER = ["DEMORADA", "EN CURSO", "SIN EMPEZAR", "POR VALIDAR", "EN ESPERA", "DONE"];
const GROUPS: { key: Group; label: string; icon: React.ReactNode }[] = [
  { key: "cliente", label: "Cliente", icon: <Building size={15} /> },
  { key: "urgencia", label: "Urgencia", icon: <CalendarClock size={15} /> },
  { key: "estado", label: "Estado", icon: <CircleDot size={15} /> },
];

const prioRank = (t: Task) => (t.priority === "Alta" ? 3 : t.priority === "Media" ? 2 : t.priority === "Baja" ? 1 : 0) + (/curso|progress|haciendo/i.test(t.status) ? 0.5 : 0);

export default function TareasPage() {
  const { currentUserId, sessionSecondsForTask, isAdmin } = useApp();
  const { tasks, projectById, clientById } = useData();

  const [view, setView] = useState<View>("mine");
  const [group, setGroup] = useState<Group>("cliente");
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [clientFilter, setClientFilter] = useState<string | null>(null);

  const clientOf = (t: Task) => (t.internal ? INTERNAL : t.clientId || projectById[t.projectId]?.clientId || NO_CLIENT);
  const clientName = (id: string) => (id === INTERNAL ? "Interno (CURVA)" : id === NO_CLIENT ? "Sin cliente" : clientById[id]?.name || "Cliente");
  const secsOf = (items: Task[]) => items.reduce((a, t) => a + t.baselineSeconds + sessionSecondsForTask(t.id), 0);

  const base = useMemo(() => (view === "all" ? tasks : tasks.filter((t) => isAssignedTo(t, currentUserId))), [tasks, view, currentUserId]);
  const visible = useMemo(() => base.filter((t) => showDone || !isDone(t.status)), [base, showDone]);

  // Sidebar de clientes (siempre visible) — cuenta sobre lo visible.
  const clientsWithCounts = useMemo(() => {
    const m = new Map<string, number>();
    visible.forEach((t) => { const c = clientOf(t); m.set(c, (m.get(c) || 0) + 1); });
    return [...m.entries()].map(([id, count]) => ({ id, name: clientName(id), count })).sort((a, b) => b.count - a.count);
  }, [visible, projectById, clientById]);

  // Filtro por cliente (del sidebar) aplica a todas las agrupaciones.
  const scoped = useMemo(() => (clientFilter ? visible.filter((t) => clientOf(t) === clientFilter) : visible), [visible, clientFilter]);

  // Búsqueda: encuentra TODO (incluye Done).
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return base.filter((t) => t.name.toLowerCase().includes(q)).sort((a, b) => Number(isDone(a.status)) - Number(isDone(b.status)) || prioRank(b) - prioRank(a));
  }, [base, search]);

  // Agrupaciones (listas planas, sin acordeones).
  const horizon = (t: Task): string => {
    const due = dueDateMs(t.dueDate);
    if (due == null) return "nofecha";
    const today0 = new Date().setHours(0, 0, 0, 0);
    if (due < today0) return "vencidas";
    if (due < today0 + DAY) return "hoy";
    if (due < today0 + 7 * DAY) return "semana";
    return "despues";
  };

  const groups = useMemo(() => {
    const byUrg = (a: Task, b: Task) => Number(isDone(a.status)) - Number(isDone(b.status)) || prioRank(b) - prioRank(a);
    if (group === "cliente") {
      const m = new Map<string, Task[]>();
      scoped.forEach((t) => { const c = clientOf(t); (m.get(c) || m.set(c, []).get(c)!).push(t); });
      return [...m.entries()].map(([id, items]) => ({ key: id, label: clientName(id), bar: "bg-accent", items: [...items].sort(byUrg) })).sort((a, b) => b.items.length - a.items.length);
    }
    if (group === "estado") {
      const m = new Map<string, Task[]>();
      scoped.forEach((t) => { const s = (t.status || "—").toUpperCase(); (m.get(s) || m.set(s, []).get(s)!).push(t); });
      return [...m.entries()].map(([s, items]) => ({ key: s, label: s, bar: isDone(s) ? "bg-emerald-500" : "bg-curva-indigo", items: [...items].sort(byUrg) }))
        .sort((a, b) => { const ia = STATUS_ORDER.indexOf(a.key), ib = STATUS_ORDER.indexOf(b.key); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    }
    // urgencia
    const open = scoped.filter((t) => !isDone(t.status));
    const out: { key: string; label: string; bar: string; items: Task[] }[] = URGENCY
      .map((s) => ({ key: s.key as string, label: s.label as string, bar: s.bar as string, items: open.filter((t) => horizon(t) === s.key).sort((a, b) => prioRank(b) - prioRank(a)) }))
      .filter((s) => s.items.length > 0);
    if (showDone) { const done = scoped.filter((t) => isDone(t.status)); if (done.length) out.push({ key: "hechas", label: "Hechas", bar: "bg-emerald-500", items: done }); }
    return out;
  }, [group, scoped, showDone, projectById, clientById]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Tareas"
        subtitle="Mira tus pendientes por cliente, urgencia o estado — con claridad."
        action={
          <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-sm shadow-soft">
            <button onClick={() => { setView("mine"); setClientFilter(null); }} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition focus-ring ${view === "mine" ? "bg-ink text-white" : "text-muted"}`}><ListTodo size={15} /> {isAdmin ? "Mías" : "Mis tareas"}</button>
            {isAdmin && <button onClick={() => { setView("all"); setClientFilter(null); }} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition focus-ring ${view === "all" ? "bg-ink text-white" : "text-muted"}`}><Users size={15} /> Equipo</button>}
          </div>
        }
      />

      {/* Una sola barra de controles: buscar · agrupar · Done */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cualquier tarea (incluye Done)…" className="w-full rounded-2xl border border-line bg-surface py-2.5 pl-11 pr-4 text-sm shadow-soft outline-none transition focus:border-accent" />
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-1 text-xs text-muted shadow-soft">
          <span className="font-semibold uppercase tracking-wide">Agrupar</span>
          {GROUPS.map((g) => (
            <button key={g.key} onClick={() => setGroup(g.key)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition focus-ring ${group === g.key ? "bg-ink text-white" : "text-muted hover:text-fg"}`}>{g.icon} {g.label}</button>
          ))}
        </div>
        <button onClick={() => setShowDone((v) => !v)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition focus-ring ${showDone ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-line bg-surface text-muted hover:border-zinc-300"}`}><Check size={15} /> Done</button>
        <button onClick={() => setShowNew(true)} className="btn-magnetic inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-sm shadow-accent/20 transition hover:opacity-90 focus-ring"><Plus size={15} /> Nueva tarea</button>
      </div>

      {searchResults ? (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{searchResults.length} resultado{searchResults.length === 1 ? "" : "s"}</p>
          {searchResults.map((t) => <TaskCard key={t.id} task={t} />)}
          {searchResults.length === 0 && <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Nada coincide con «{search.trim()}».</div>}
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Sidebar de clientes — SIEMPRE visible (es como navegas por cliente) */}
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="sticky top-20 space-y-0.5">
              <SidebarItem icon={<Inbox size={15} />} label="Todos" count={visible.length} active={!clientFilter} onClick={() => setClientFilter(null)} />
              <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted">Clientes</p>
              <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
                {clientsWithCounts.map((c) => <SidebarItem key={c.id} icon={<Building2 size={15} />} label={c.name} count={c.count} active={clientFilter === c.id} onClick={() => setClientFilter(c.id)} />)}
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1 space-y-6">
            {/* Selector de cliente en móvil */}
            <select value={clientFilter || ""} onChange={(e) => setClientFilter(e.target.value || null)} className="w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-sm lg:hidden">
              <option value="">Todos los clientes ({visible.length})</option>
              {clientsWithCounts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
            </select>

            {groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">{showDone ? "No hay tareas aquí." : "Sin pendientes accionables 🎉 — muestra las Done o crea una desde la Home."}</div>
            ) : (
              groups.map((g) => (
                <div key={g.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className={`h-4 w-1.5 rounded-full ${g.bar}`} />
                    <h2 className="font-display text-base font-bold text-fg">{g.label}</h2>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{g.items.length}</span>
                    {secsOf(g.items) > 0 && <span className="tabular text-xs text-muted">· {formatDuration(secsOf(g.items))}</span>}
                  </div>
                  <div className="space-y-2">{g.items.slice(0, 80).map((t) => <TaskCard key={t.id} task={t} />)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <NewTaskModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

function SidebarItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${active ? "bg-accent/10 text-accent" : "text-fg hover:bg-surface-2"}`}>
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className={`shrink-0 rounded-full px-1.5 text-xs font-semibold ${active ? "bg-accent/15" : "bg-surface-2 text-muted"}`}>{count}</span>
    </button>
  );
}
