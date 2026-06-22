"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// Naturaleza de una sesión de tiempo:
//  - "manual": tú trabajando con tus manos (máximo una a la vez).
//  - "ai": la IA resuelve la tarea / estás esperando su resultado (varias en paralelo).
export type TimeMode = "manual" | "ai";

export type TimeEntry = {
  id: string;
  taskId: string;
  userId: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  seconds: number; // segundos CONTADOS (lo que vale el registro)
  inactiveSeconds: number; // de esos, cuántos fueron sin actividad (marcados)
  mode: TimeMode; // manual (tus manos) o ai (espera/IA trabajando)
};

type ActiveTimer = {
  taskId: string;
  startedAt: number;
} | null;

// Relojes de IA corriendo en paralelo (uno por tarea que la IA está resolviendo).
type AiTimer = { taskId: string; startedAt: number };

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

  active: ActiveTimer; // tu reloj MANUAL (uno a la vez)
  entries: TimeEntry[];
  start: (taskId: string) => void;
  stop: () => void;

  // Relojes de IA en paralelo (la IA trabaja mientras tú haces otra cosa).
  // Al delegar una tarea a la IA, si te quedas sin reloj manual, "saltas"
  // automáticamente a otra tarea abierta (opts.autoResume fuerza/anula cuál).
  aiActive: AiTimer[];
  startAI: (taskId: string, opts?: { autoResume?: string | null; silent?: boolean }) => void;
  stopAI: (taskId: string) => void;
  toggleAI: (taskId: string, opts?: { autoResume?: string | null; silent?: boolean }) => void;
  isAI: (taskId: string) => boolean;
  // taskId al que saltó el reloj manual por delegar otra a la IA (para resaltarlo
  // un instante). Se limpia solo tras ~2.5s.
  autoResumed: string | null;

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
  const [aiActive, setAiActive] = useState<AiTimer[]>([]);
  const [openTasks, setOpenTasks] = useState<string[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [pendingReview, setPendingReview] = useState<PendingReview>(null);
  const [focusApp, setFocusApp] = useState<FocusApp>(null);
  const [autoResumed, setAutoResumed] = useState<string | null>(null);

  const counter = useRef(0);
  const lastActivity = useRef(0);
  const segments = useRef<Segment[]>([]); // segmentos inactivos de la corrida actual
  const activeRef = useRef<ActiveTimer>(null);
  const aiActiveRef = useRef<AiTimer[]>([]);
  const openTasksRef = useRef<string[]>([]);
  // Tareas marcadas como IA por el conector (Claude Code/Desktop): visuales, NO registran
  // entry propio (el tiempo IA lo registra el conector en Notion → evita doble conteo).
  const silentAIRef = useRef<Set<string>>(new Set());
  const userRef = useRef<string | null>(null);
  const autoResumedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { aiActiveRef.current = aiActive; }, [aiActive]);
  useEffect(() => { openTasksRef.current = openTasks; }, [openTasks]);
  useEffect(() => { userRef.current = currentUserId; }, [currentUserId]);

  // Resalta brevemente la tarea a la que saltaste al delegar otra a la IA.
  const flagAutoResume = (taskId: string) => {
    setAutoResumed(taskId);
    if (autoResumedTimer.current) clearTimeout(autoResumedTimer.current);
    autoResumedTimer.current = setTimeout(() => setAutoResumed(null), 2500);
  };

  // Registra una sesión de tiempo (con su porción inactiva).
  const pushEntry = (
    userId: string,
    taskId: string,
    startedAt: number,
    endedAt: number,
    seconds: number,
    inactiveSeconds: number,
    mode: TimeMode = "manual",
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
      mode,
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
            setAiActive(parsed.aiActive ?? []);
            setEntries((parsed.entries ?? []).map((e: TimeEntry) => ({ ...e, inactiveSeconds: e.inactiveSeconds ?? 0, mode: e.mode ?? "manual" })));
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
    localStorage.setItem(dataKey(currentUserId), JSON.stringify({ active, aiActive, entries, openTasks }));
  }, [ready, currentUserId, active, aiActive, entries, openTasks]);

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
        const parsed = raw ? JSON.parse(raw) : { active: null, aiActive: [], entries: [], openTasks: [] };
        setActive(parsed.active ?? null);
        setAiActive(parsed.aiActive ?? []);
        setEntries((parsed.entries ?? []).map((e: TimeEntry) => ({ ...e, inactiveSeconds: e.inactiveSeconds ?? 0, mode: e.mode ?? "manual" })));
        setOpenTasks(parsed.openTasks ?? []);
      } catch {
        setActive(null); setAiActive([]); setEntries([]); setOpenTasks([]);
      }
    } else {
      setActive(null); setAiActive([]); setEntries([]); setOpenTasks([]);
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

  // Cierra el reloj de IA de una tarea (registra el tramo) y lo quita de la lista.
  const closeAI = (taskId: string, endedAt: number) => {
    const timer = aiActiveRef.current.find((a) => a.taskId === taskId);
    // No registra si es "silent" (lo registra el conector de IA en Notion).
    if (timer && userRef.current && !silentAIRef.current.has(taskId)) {
      pushEntry(userRef.current, taskId, timer.startedAt, endedAt, round(endedAt - timer.startedAt), 0, "ai");
    }
    silentAIRef.current.delete(taskId);
    const next = aiActiveRef.current.filter((a) => a.taskId !== taskId);
    aiActiveRef.current = next;
    setAiActive(next);
  };

  // Arranca/cambia de tarea (MANUAL). Al cambiar, cierra la anterior manteniendo+marcando inactivo (sin modal).
  const start = (taskId: string) => {
    const startedAt = Date.now();
    // Si la IA estaba resolviendo esta tarea y ahora la tocas tú, cierra su tramo de IA.
    closeAI(taskId, startedAt);
    const prev = activeRef.current;
    if (prev && userRef.current) {
      const run = computeRun(prev.startedAt, startedAt);
      pushEntry(userRef.current, prev.taskId, prev.startedAt, startedAt, run.totalSec, run.inactiveSec, "manual");
    }
    setActive({ taskId, startedAt });
    setOpenTasks((p) => (p.includes(taskId) ? p : [...p, taskId]));
    resetRun(startedAt);
  };

  // Marca una tarea como "IA trabajando": corre en paralelo, sin tocar tu reloj manual de otra tarea.
  // Si al delegarla te quedas sin reloj manual, saltas (play) a otra tarea abierta:
  // "se lo paso a la IA y sigo a mano con lo siguiente" — sin tener que picar play.
  const startAI = (taskId: string, opts?: { autoResume?: string | null; silent?: boolean }) => {
    const startedAt = Date.now();
    if (aiActiveRef.current.some((a) => a.taskId === taskId)) return; // ya en IA
    if (opts?.silent) silentAIRef.current.add(taskId);
    const wasManualHere = activeRef.current?.taskId === taskId;
    // Si era tu tarea manual actual, ciérrala como manual y pásala a modo IA.
    if (wasManualHere && userRef.current) {
      const run = computeRun(activeRef.current!.startedAt, startedAt);
      pushEntry(userRef.current, taskId, activeRef.current!.startedAt, startedAt, run.totalSec, run.inactiveSec, "manual");
      setActive(null);
      activeRef.current = null;
      resetRun(startedAt);
    }
    const next = [...aiActiveRef.current, { taskId, startedAt }];
    aiActiveRef.current = next;
    setAiActive(next);
    setOpenTasks((p) => (p.includes(taskId) ? p : [...p, taskId]));

    // Auto-salto: solo si quedaste SIN reloj manual (si ya trabajas a mano en
    // otra, no te robamos el foco). Candidata = la indicada, o la última tarea
    // abierta que no sea esta ni esté en IA.
    if (!activeRef.current) {
      const inAI = new Set(next.map((a) => a.taskId));
      let resume: string | null | undefined = opts?.autoResume;
      if (resume === undefined) {
        resume = [...openTasksRef.current].reverse().find((t) => t !== taskId && !inAI.has(t)) ?? null;
      }
      if (resume && resume !== taskId && !inAI.has(resume)) {
        start(resume); // arranca el reloj manual en la otra tarea
        flagAutoResume(resume);
      }
    }
  };

  const stopAI = (taskId: string) => closeAI(taskId, Date.now());
  const toggleAI = (taskId: string, opts?: { autoResume?: string | null; silent?: boolean }) => {
    if (aiActiveRef.current.some((a) => a.taskId === taskId)) stopAI(taskId);
    else startAI(taskId, opts);
  };

  // Pausar/Detener: si hubo inactividad, abre revisión; si no, registra directo.
  const stop = () => {
    const a = activeRef.current;
    if (!a || !userRef.current) return;
    const endedAt = Date.now();
    const run = computeRun(a.startedAt, endedAt);
    if (run.inactiveSec <= 0) {
      pushEntry(userRef.current, a.taskId, a.startedAt, endedAt, run.totalSec, 0, "manual");
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
      pushEntry(userRef.current, pr.taskId, pr.startedAt, pr.endedAt, pr.activeSec, 0, "manual");
    } else {
      pushEntry(userRef.current, pr.taskId, pr.startedAt, pr.endedAt, pr.totalSec, pr.inactiveSec, "manual");
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
    if (aiActiveRef.current.some((a) => a.taskId === taskId)) stopAI(taskId);
    setOpenTasks((p) => p.filter((t) => t !== taskId));
  };

  const isAI = (taskId: string) => aiActive.some((a) => a.taskId === taskId);

  const sessionSecondsForTask = (taskId: string) =>
    entries.filter((e) => e.taskId === taskId).reduce((a, e) => a + e.seconds, 0);
  const loggedSecondsToday = entries.reduce((a, e) => a + e.seconds, 0);

  const value: AppState = {
    ready, currentUserId, setCurrentUser, logout,
    active, entries, start, stop,
    aiActive, startAI, stopAI, toggleAI, isAI, autoResumed,
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
  const { active, aiActive } = useApp();
  // Una tarea puede estar en tu reloj manual o en un reloj de IA (nunca ambos a la vez).
  const aiTimer = taskId != null ? aiActive.find((a) => a.taskId === taskId) : undefined;
  const manualThis = taskId == null ? !!active : active?.taskId === taskId;
  const startedAt = manualThis ? active?.startedAt : aiTimer?.startedAt;
  const live = manualThis || !!aiTimer;
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!live || !startedAt) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live, startedAt]);
  return live && startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
}
