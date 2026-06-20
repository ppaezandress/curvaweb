"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Member, Client, Project, Task, TaskType } from "@/lib/mock-data";
import {
  members as mockMembers,
  clients as mockClients,
  projects as mockProjects,
  tasks as mockTasks,
  taskTypes as mockTaskTypes,
} from "@/lib/mock-data";

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

  const load = () => {
    fetch("/api/data")
      .then((r) => r.json())
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
        // Respaldo local si ni la API responde.
        setData({
          members: mockMembers,
          clients: mockClients,
          projects: mockProjects,
          tasks: mockTasks,
          taskTypes: mockTaskTypes,
        });
        setSource("mock-local");
        setReady(true);
      });
  };

  useEffect(() => {
    load();
  }, []);

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

  return (
    <DataContext.Provider value={{ ...data, ...maps, ready, source, reload: load }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData debe usarse dentro de <DataProvider>");
  return ctx;
}
