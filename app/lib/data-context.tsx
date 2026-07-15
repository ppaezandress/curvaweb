"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Member, Client, Project, Task, TaskType } from "@/lib/mock-data";
import type { TimeRecord } from "@/lib/notion/fetchers";
import {
  members as mockMembers,
  clients as mockClients,
  projects as mockProjects,
  tasks as mockTasks,
  taskTypes as mockTaskTypes,
} from "@/lib/mock-data";
import { supabaseConfigured } from "@/lib/supabase/client";

type Data = {
  members: Member[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  taskTypes: TaskType[];
};

type DataCtx = Data & {
  ready: boolean;
  source: string;
  memberById: Record<string, Member>;
  clientById: Record<string, Client>;
  projectById: Record<string, Project>;
  taskById: Record<string, Task>;
  taskTypeById: Record<string, TaskType>;
  reload: () => void;
  // Registros de tiempo recién creados en esta sesión (aún puede que Notion no los indexe).
  // Las vistas del historial los mezclan con lo que trae Notion (dedupe por id) para que un
  // registro manual aparezca al instante y no se registre dos veces por el lag de indexado.
  recentEntries: TimeRecord[];
  addRecentEntries: (recs: TimeRecord[]) => void;
  // Quita del buffer un registro recién creado que se acaba de borrar (que no reaparezca).
  removeRecentEntry: (id: string) => void;
};

const empty: Data = {
  members: [],
  clients: [],
  projects: [],
  tasks: [],
  taskTypes: [],
};

const DataContext = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(empty);
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState("");
  // Buffer de registros recién creados (con marca de tiempo para poder podar los viejos).
  const [recent, setRecent] = useState<{ rec: TimeRecord; at: number }[]>([]);

  const addRecentEntries = useCallback((recs: TimeRecord[]) => {
    if (!recs.length) return;
    const now = Date.now();
    setRecent((prev) =>
      // Poda: descarta lo de hace > 5 min (Notion indexa en segundos; con esto no crece).
      [...prev.filter((e) => now - e.at < 300_000), ...recs.map((rec) => ({ rec, at: now }))],
    );
  }, []);

  const removeRecentEntry = useCallback((id: string) => {
    setRecent((prev) => prev.filter((e) => e.rec.id !== id));
  }, []);

  const load = useCallback(() => {
    // Modo demo (sin Supabase): no hay a quién pedirle datos — /api/data respondería
    // 401 y dejaría el picker vacío. Usamos el respaldo local directo para que la app
    // sea navegable (demo y QA visual) sin backend.
    if (!supabaseConfigured()) {
      setData({
        members: mockMembers,
        clients: mockClients,
        projects: mockProjects,
        tasks: mockTasks,
        taskTypes: mockTaskTypes,
      });
      setSource("mock-local");
      setReady(true);
      return;
    }
    // Timeout: si /api/data se cuelga (red lenta, Notion sin responder), no dejamos
    // la app en "Cargando…" para siempre — caemos a respaldo local y seguimos.
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    fetch("/api/data", { signal: ctrl.signal })
      .then((r) => {
        // Sin sesión (p. ej. en /login): la API responde 401 ANTES de tocar Notion (no hay
        // full-scan). Devolvemos vacío sin parsear el cuerpo de error como si fueran datos.
        if (!r.ok) return { source: r.status === 401 ? "anon" : "error" };
        return r.json();
      })
      .then((d) => {
        setData({
          members: d.members ?? [],
          clients: d.clients ?? [],
          projects: d.projects ?? [],
          tasks: d.tasks ?? [],
          taskTypes: d.taskTypes ?? [],
        });
        setSource(d.source ?? "");
        setReady(true);
      })
      .catch(() => {
        // Respaldo local si la API no responde o se agota el tiempo.
        setData({
          members: mockMembers,
          clients: mockClients,
          projects: mockProjects,
          tasks: mockTasks,
          taskTypes: mockTaskTypes,
        });
        setSource("mock-local");
        setReady(true);
      })
      .finally(() => clearTimeout(to));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maps = useMemo(
    () => ({
      memberById: Object.fromEntries(data.members.map((m) => [m.id, m])),
      clientById: Object.fromEntries(data.clients.map((c) => [c.id, c])),
      projectById: Object.fromEntries(data.projects.map((p) => [p.id, p])),
      taskById: Object.fromEntries(data.tasks.map((t) => [t.id, t])),
      taskTypeById: Object.fromEntries(data.taskTypes.map((t) => [t.id, t])),
    }),
    [data],
  );

  const recentEntries = useMemo(() => recent.map((e) => e.rec), [recent]);

  const value = useMemo(
    () => ({ ...data, ...maps, ready, source, reload: load, recentEntries, addRecentEntries, removeRecentEntry }),
    [data, maps, ready, source, load, recentEntries, addRecentEntries, removeRecentEntry],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>");
  return ctx;
}
