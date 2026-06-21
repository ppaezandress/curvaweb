"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

export type TimeEntry = {
  id: string;
  taskId: string;
  userId: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  seconds: number; // segundos CONTADOS (lo que vale el registro)
  inactiveSeconds: number; // de esos, cuántos fueron sin actividad (marcados)
};

type ActiveTimer = {
  taskId: string;
  startedAt: number;
} | null;

type Segment = { start: number; end: number };

export type PendingReview = {
  taskId: string;
  startedAt: number;
  endedAt: number;
  segments: Segment[];
  totalSec: number;
  activeSec: number;
  inactiveSec: number;
} | null;

export type FocusApp = {
  label: string;
  tone: "work" | "distraction" | "neutral";
} | null;

type AppState = {
  ready: boolean;
  currentUserId: string | null;
  setCurrentUser: (id: string | null) => void;
  logout: () => void;

  active: ActiveTimer;
  entries: TimeEntry[];
  start: (taskId: string) => void;
  stop: () => void;

  // Multi-tarea
  openTasks: string[];
  openTask: (taskId: string) => void;
  switchTo: (taskId: string) => void;
  pause: () => void;
  closeTask: (taskId: string) => void;

  // Revisión de inactividad al pausar
  pendingReview: PendingReview;
  resolveReview: (discount: boolean) => void;

  // Actividad / foco
  markActivity: () => void;
  focusApp: FocusApp;
  setFocus: (f: FocusApp) => void;

  sessionSecondsForTask: (taskId: string) => number;
  loggedSecondsToday: number;
};

const AppContext = createContext<AppState | null>(null);

const SESSION_KEY = "curva.session.user";
const dataKey = (userId: string) => `curva.timer.${userId}`;

// Gracia de inactividad: 5 min. Override demo vía localStorage["curva.graceSeconds"].
const DEFAULT_GRACE_SECONDS = 300;
function graceMs() {
  if (typeof window === "undefined") return DEFAULT_GRACE_SECONDS * 1000;
  const raw = Number(localStorage.getItem("curva.graceSeconds"));
  return (raw > 0 ? raw : DEFAULT_GRACE_SECONDS) * 1000;
}

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

const round = (ms: number) => Math.max(0, Math.round(ms / 1000));

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTimer>(null);
  const [openTasks, setOpenTasks] = useState<string[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [pendingReview, setPendingReview] = useState<PendingReview>(null);
  const [focusApp, setFocusApp] = useState<FocusApp>(null);

  const counter = useRef(0);
  const lastActivity = useRef(0);
  const segments = useRef<Segment[]>([]); // segmentos inactivos de la corrida actual
  const activeRef = useRef<ActiveTimer>(null);
  const userRef = useRef<string | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { userRef.current = currentUserId; }, [currentUserId]);

  // Registra una sesión de tiempo (con su porción inactiva).
  const pushEntry = (
    userId: string,
    taskId: string,
    startedAt: number,
    endedAt: number,
    seconds: number,
    inactiveSeconds: number,
  ) => {
    if (seconds <= 0) return;
    counter.current += 1;
    const entry: TimeEntry = {
      id: `e${endedAt}-${counter.current}`,
      taskId,
      userId,
      startedAt,
      endedAt,
      seconds,
      inactiveSeconds,
    };
    setEntries((e) => [...e, entry]);
  };

  // Marca actividad y, si hubo un hueco mayor a la gracia, registra el tramo inactivo.
  const markRef = useRef<() => void>(() => {});
  markRef.current = () => {
    const t = Date.now();
    if (activeRef.current) {
      const g = graceMs();
      const gap = t - lastActivity.current;
      if (gap > g) segments.current.push({ start: lastActivity.current + g, end: t });
    }
    lastActivity.current = t;
  };

  // Cierra la corrida actual y calcula activo/inactivo (incluye el hueco final).
  const computeRun = (startedAt: number, endedAt: number) => {
    const segs = [...segments.current];
    const g = graceMs();
    const tailGap = endedAt - lastActivity.current;
    if (tailGap > g) segs.push({ start: lastActivity.current + g, end: endedAt });
    const inactiveMs = segs.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
    const totalMs = Math.max(0, endedAt - startedAt);
    return {
      segs,
      totalSec: round(totalMs),
      inactiveSec: round(inactiveMs),
      activeSec: round(totalMs - inactiveMs),
    };
  };

  const resetRun = (at: number) => {
    segments.current = [];
    lastActivity.current = at;
  };

  // --- Hidratar + validar sesión Supabase + service worker ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let userId: string | null = null;
      try { userId = localStorage.getItem(SESSION_KEY); } catch { /* */ }

      // Con Supabase: la sesión real manda. Sin sesión → exigir login.
      if (supabaseConfigured()) {
        const sb = getSupabase();
        try {
          const { data } = await sb!.auth.getUser();
          if (!data.user) {
            userId = null;
          } else if (!userId) {
            const { data: prof } = await sb!
              .from("profiles").select("notion_user_id").eq("id", data.user.id).maybeSingle();
            userId = (prof?.notion_user_id as string) ?? null;
          }
        } catch { /* si falla, cae a localStorage */ }
      }

      if (cancelled) return;
      if (userId) {
        setCurrentUserId(userId);
        try {
          const raw = localStorage.getItem(dataKey(userId));
          if (raw) {
            const parsed = JSON.parse(raw);
            setActive(parsed.active ?? null);
            setEntries((parsed.entries ?? []).map((e: TimeEntry) => ({ ...e, inactiveSeconds: e.inactiveSeconds ?? 0 })));
            setOpenTasks(parsed.openTasks ?? []);
          }
        } catch { /* */ }
      }
      lastActivity.current = Date.now();
      setReady(true);
    })();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);

  // Persistir
  useEffect(() => {
    if (!ready || !currentUserId) return;
    localStorage.setItem(dataKey(currentUserId), JSON.stringify({ active, entries, openTasks }));
  }, [ready, currentUserId, active, entries, openTasks]);

  // Escuchar actividad del usuario (web) mientras corre el cronómetro.
  useEffect(() => {
    if (!active) return;
    const handler = () => markRef.current();
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, handler, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, handler));
  }, [active]);

  const setCurrentUser = (id: string | null) => {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
    setCurrentUserId(id);
    setPendingReview(null);
    resetRun(Date.now());
    if (id) {
      try {
        const raw = localStorage.getItem(dataKey(id));
        const parsed = raw ? JSON.parse(raw) : { active: null, entries: [], openTasks: [] };
        setActive(parsed.active ?? null);
        setEntries((parsed.entries ?? []).map((e: TimeEntry) => ({ ...e, inactiveSeconds: e.inactiveSeconds ?? 0 })));
        setOpenTasks(parsed.openTasks ?? []);
      } catch {
        setActive(null); setEntries([]); setOpenTasks([]);
      }
    } else {
      setActive(null); setEntries([]); setOpenTasks([]);
    }
  };

  const logout = () => {
    if (supabaseConfigured()) {
      try { getSupabase()?.auth.signOut(); } catch { /* */ }
    }
    setCurrentUser(null);
  };
  const markActivity = () => markRef.current();
  const setFocus = (f: FocusApp) => setFocusApp(f);

  // Arranca/cambia de tarea. Al cambiar, cierra la anterior manteniendo+marcando inactivo (sin modal).
  const start = (taskId: string) => {
    const startedAt = Date.now();
    const prev = activeRef.current;
    if (prev && userRef.current) {
      const run = computeRun(prev.startedAt, startedAt);
      pushEntry(userRef.current, prev.taskId, prev.startedAt, startedAt, run.totalSec, run.inactiveSec);
    }
    setActive({ taskId, startedAt });
    setOpenTasks((p) => (p.includes(taskId) ? p : [...p, taskId]));
    resetRun(startedAt);
  };

  // Pausar/Detener: si hubo inactividad, abre revisión; si no, registra directo.
  const stop = () => {
    const a = activeRef.current;
    if (!a || !userRef.current) return;
    const endedAt = Date.now();
    const run = computeRun(a.startedAt, endedAt);
    if (run.inactiveSec <= 0) {
      pushEntry(userRef.current, a.taskId, a.startedAt, endedAt, run.totalSec, 0);
    } else {
      setPendingReview({
        taskId: a.taskId, startedAt: a.startedAt, endedAt,
        segments: run.segs, totalSec: run.totalSec, activeSec: run.activeSec, inactiveSec: run.inactiveSec,
      });
    }
    setActive(null);
    resetRun(endedAt);
  };

  const resolveReview = (discount: boolean) => {
    const pr = pendingReview;
    if (!pr || !userRef.current) { setPendingReview(null); return; }
    if (discount) {
      pushEntry(userRef.current, pr.taskId, pr.startedAt, pr.endedAt, pr.activeSec, 0);
    } else {
      pushEntry(userRef.current, pr.taskId, pr.startedAt, pr.endedAt, pr.totalSec, pr.inactiveSec);
    }
    setPendingReview(null);
  };

  // Multi-tarea
  const openTask = (taskId: string) =>
    setOpenTasks((p) => (p.includes(taskId) ? p : [...p, taskId]));
  const switchTo = (taskId: string) => start(taskId);
  const pause = () => stop();
  const closeTask = (taskId: string) => {
    if (activeRef.current?.taskId === taskId) stop();
    setOpenTasks((p) => p.filter((t) => t !== taskId));
  };

  const sessionSecondsForTask = (taskId: string) =>
    entries.filter((e) => e.taskId === taskId).reduce((a, e) => a + e.seconds, 0);
  const loggedSecondsToday = entries.reduce((a, e) => a + e.seconds, 0);

  const value: AppState = {
    ready, currentUserId, setCurrentUser, logout,
    active, entries, start, stop,
    openTasks, openTask, switchTo, pause, closeTask,
    pendingReview, resolveReview,
    markActivity, focusApp, setFocus,
    sessionSecondsForTask, loggedSecondsToday,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return ctx;
}

// Reloj en vivo aislado: solo el componente que lo usa re-renderiza cada segundo
// (evita re-render de listas grandes). Pasa taskId para que SOLO la tarjeta activa tickee.
export function useLiveElapsed(taskId?: string) {
  const { active } = useApp();
  const isThis = taskId == null ? !!active : active?.taskId === taskId;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isThis || !active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isThis, active]);
  return active && isThis ? Math.max(0, Math.round((now - active.startedAt) / 1000)) : 0;
}
