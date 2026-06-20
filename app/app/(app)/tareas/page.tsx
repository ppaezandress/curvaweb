"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ListTodo,
  Users,
  Building2,
  Search,
  ChevronDown,
  ChevronRight,
  Inbox,
  Folder,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { type Task } from "@/lib/mock-data";
import { formatDuration } from "@/lib/format";
import { TaskCard } from "@/components/TaskCard";

type View = "mine" | "all";
const NO_CLIENT = "__sin_cliente__";
const NO_PROJECT = "__sin_proyecto__";

export default function TareasPage() {
  const { currentUserId, sessionSecondsForTask } = useApp();
  const { tasks, projectById, clientById } = useData();

  const [view, setView] = useState<View>("mine");
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [openClients, setOpenClients] = useState<Set<string>>(new Set());
  const [openProjects, setOpenProjects] = useState<Set<string>>(new Set());

  const isMine = (t: Task) =>
    t.responsableId === currentUserId || t.auxiliarId === currentUserId;

  // Cliente de una tarea: directo, o heredado de su proyecto.
  const clientOf = (t: Task) =>
    t.clientId || projectById[t.projectId]?.clientId || NO_CLIENT;
  const clientName = (id: string) =>
    id === NO_CLIENT ? "Sin cliente" : clientById[id]?.name || "Cliente";
  const projectName = (id: string) =>
    id === NO_PROJECT || !id ? "Sin proyecto" : projectById[id]?.name || "Proyecto";

  const base = useMemo(
    () => (view === "all" ? tasks : tasks.filter(isMine)),
    [tasks, view, currentUserId],
  );

  // Sidebar: clientes con conteo
  const clientsWithCounts = useMemo(() => {
    const m = new Map<string, number>();
    base.forEach((t) => {
      const c = clientOf(t);
      m.set(c, (m.get(c) || 0) + 1);
    });
    return [...m.entries()]
      .map(([id, count]) => ({ id, name: clientName(id), count }))
      .sort((a, b) => b.count - a.count);
  }, [base, projectById, clientById]);

  const statuses = useMemo(() => {
    const s = new Set<string>();
    base.forEach((t) => s.add(t.status));
    return [...s];
  }, [base]);

  const filtered = useMemo(() => {
    let r = base;
    if (clientFilter) r = r.filter((t) => clientOf(t) === clientFilter);
    if (statusFilter) r = r.filter((t) => t.status === statusFilter);
    if (search.trim())
      r = r.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
    return r;
  }, [base, clientFilter, statusFilter, search]);

  // Jerarquía: Cliente → Proyecto → Tareas
  const tree = useMemo(() => {
    const byClient = new Map<string, Map<string, Task[]>>();
    filtered.forEach((t) => {
      const c = clientOf(t);
      const p = t.projectId || NO_PROJECT;
      if (!byClient.has(c)) byClient.set(c, new Map());
      const projMap = byClient.get(c)!;
      if (!projMap.has(p)) projMap.set(p, []);
      projMap.get(p)!.push(t);
    });
    return [...byClient.entries()]
      .map(([cId, projMap]) => {
        const projects = [...projMap.entries()]
          .map(([pId, items]) => ({ id: pId, name: projectName(pId), items }))
          .sort((a, b) => b.items.length - a.items.length);
        const count = projects.reduce((a, p) => a + p.items.length, 0);
        return { id: cId, name: clientName(cId), projects, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [filtered, projectById, clientById]);

  // Abrir todos los clientes por defecto (proyectos colapsados → drill-down).
  useEffect(() => {
    setOpenClients(new Set(tree.map((c) => c.id)));
    setOpenProjects(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const drillOpen = !!search.trim() || !!statusFilter;

  const toggleClient = (id: string) =>
    setOpenClients((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleProject = (key: string) =>
    setOpenProjects((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  const secsOf = (items: Task[]) =>
    items.reduce((a, t) => a + t.baselineSeconds + sessionSecondsForTask(t.id), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">Tareas</h1>
        <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm shadow-soft">
          <button onClick={() => { setView("mine"); setClientFilter(null); }} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition ${view === "mine" ? "bg-ink text-white" : "text-zinc-500"}`}>
            <ListTodo size={15} /> Mías
          </button>
          <button onClick={() => { setView("all"); setClientFilter(null); }} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition ${view === "all" ? "bg-ink text-white" : "text-zinc-500"}`}>
            <Users size={15} /> Equipo
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar: CLIENTES */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 space-y-1">
            <SidebarItem icon={<Inbox size={15} />} label="Todos los clientes" count={base.length} active={!clientFilter} onClick={() => setClientFilter(null)} />
            <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Clientes</p>
            <div className="max-h-[62vh] space-y-0.5 overflow-y-auto pr-1">
              {clientsWithCounts.map((c) => (
                <SidebarItem key={c.id} icon={<Building2 size={15} />} label={c.name} count={c.count} active={clientFilter === c.id} onClick={() => setClientFilter(c.id)} />
              ))}
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tarea..." className="w-full rounded-2xl border border-line bg-white py-3 pl-11 pr-4 text-sm shadow-soft outline-none transition focus:border-curva-purple" />
            </div>
            <div className="lg:hidden">
              <select value={clientFilter || ""} onChange={(e) => setClientFilter(e.target.value || null)} className="w-full rounded-2xl border border-line bg-white px-4 py-2.5 text-sm">
                <option value="">Todos los clientes ({base.length})</option>
                {clientsWithCounts.map((c) => (<option key={c.id} value={c.id}>{c.name} ({c.count})</option>))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={!statusFilter} onClick={() => setStatusFilter(null)}>Todos</Chip>
              {statuses.map((s) => (<Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(statusFilter === s ? null : s)}>{s}</Chip>))}
            </div>
          </div>

          {/* Árbol Cliente → Proyecto → Tareas */}
          <div className="space-y-3">
            {tree.map((client) => {
              const clientOpen = drillOpen || openClients.has(client.id);
              return (
                <div key={client.id} className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
                  <button onClick={() => toggleClient(client.id)} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-zinc-50">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {clientOpen ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-ink/5 text-ink"><Building2 size={15} /></span>
                      <span className="truncate font-display text-base font-bold text-ink">{client.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-xs text-zinc-500">
                      {secsOf(client.projects.flatMap((p) => p.items)) > 0 && (
                        <span className="tabular">{formatDuration(secsOf(client.projects.flatMap((p) => p.items)))}</span>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-600">{client.count}</span>
                    </span>
                  </button>

                  {clientOpen && (
                    <div className="space-y-1.5 border-t border-line bg-zinc-50/60 p-3">
                      {client.projects.map((proj) => {
                        const key = `${client.id}:${proj.id}`;
                        const projOpen = drillOpen || openProjects.has(key);
                        return (
                          <div key={key} className="overflow-hidden rounded-xl border border-line bg-white">
                            <button onClick={() => toggleProject(key)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-zinc-50">
                              <span className="flex min-w-0 items-center gap-2">
                                {projOpen ? <ChevronDown size={15} className="text-zinc-400" /> : <ChevronRight size={15} className="text-zinc-400" />}
                                <Folder size={14} className="shrink-0 text-zinc-400" />
                                <span className="truncate text-sm font-semibold text-zinc-700">{proj.name}</span>
                              </span>
                              <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">{proj.items.length}</span>
                            </button>
                            {projOpen && (
                              <div className="space-y-2 border-t border-line p-2.5">
                                {proj.items.map((t) => (<TaskCard key={t.id} task={t} />))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {tree.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-zinc-400">No hay tareas que coincidan.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${active ? "bg-curva-purple/10 text-curva-purple" : "text-zinc-600 hover:bg-zinc-100"}`}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <span className={`shrink-0 rounded-full px-1.5 text-xs font-semibold ${active ? "bg-curva-purple/15" : "bg-zinc-100 text-zinc-500"}`}>{count}</span>
    </button>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? "bg-ink text-white" : "border border-line bg-white text-zinc-600 hover:border-zinc-300"}`}>
      {children}
    </button>
  );
}
