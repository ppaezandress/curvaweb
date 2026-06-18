"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type TimeEntry = {
  id: string;
  taskId: string;
  userId: string;
  startedAt: number; // epoch ms
  endedAt: number; // epoch ms
  seconds: number;
};

type ActiveTimer = {
  taskId: string;
  startedAt: number; // epoch ms
} | null;

type Nudge = {
  taskId: string;
  idleSince: number; // epoch ms — desde cuándo no hay actividad
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
  elapsed: number; // segundos del cronómetro activo, en vivo
  start: (taskId: string) => void;
  stop: () => void;

  /** Aviso de inactividad pendiente de resolver. */
  nudge: Nudge;
  /** Conservar el tiempo inactivo (sí estaba trabajando: pensando, leyendo, en llamada). */
  keepIdle: () => void;
  /** Descartar el tiempo inactivo (se fue) — no se cuenta el hueco. */
  discardIdle: () => void;

  /** Marca actividad del usuario (usado por el idle del SISTEMA en escritorio). */
  markActivity: () => void;
  /** App en foco del sistema (solo escritorio; null en web). */
  focusApp: FocusApp;
  setFocus: (f: FocusApp) => void;

  /** Segundos registrados en esta sesión (no incluye baseline) para una tarea. */
  sessionSecondsForTask: (taskId: string) => number;
  /** Segundos totales del usuario actual hoy (entries de esta sesión). */
  loggedSecondsToday: number;
};

const AppContext = createContext<AppState | null>(null);

const SESSION_KEY = "curva.session.user";
const dataKey = (userId: string) => `curva.timer.${userId}`;

// Umbral de inactividad. Producción: ~5 min (300). Configurable por persona/equipo.
// Override para demos/pruebas vía localStorage["curva.idleSeconds"].
const DEFAULT_IDLE_SECONDS = 60;

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTimer>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [now, setNow] = useState<number>(0);
  const [nudge, setNudge] = useState<Nudge>(null);
  const [focusApp, setFocusApp] = useState<FocusApp>(null);
  const counter = useRef(0);
  const lastActivity = useRef(0);

  const pushEntry = (
    userId: string,
    taskId: string,
    startedAt: number,
    endedAt: number,
  ) => {
    const seconds = Math.round((endedAt - startedAt) / 1000);
    if (seconds <= 0) return;
    counter.current += 1;
    const entry: TimeEntry = {
      id: `e${endedAt}-${counter.current}`,
      taskId,
      userId,
      startedAt,
      endedAt,
      seconds,
    };
    setEntries((e) => [...e, entry]);
  };

  // Hidratar desde localStorage al montar + registrar service worker (PWA).
  useEffect(() => {
    try {
      const userId = localStorage.getItem(SESSION_KEY);
      if (userId) {
        setCurrentUserId(userId);
        const raw = localStorage.getItem(dataKey(userId));
        if (raw) {
          const parsed = JSON.parse(raw) as {
            active: ActiveTimer;
            entries: TimeEntry[];
          };
          setActive(parsed.active ?? null);
          setEntries(parsed.entries ?? []);
        }
      }
    } catch {
      // estado limpio si algo falla
    }
    lastActivity.current = Date.now();
    setNow(Date.now());
    setReady(true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Persistir cronómetro + entries por usuario.
  useEffect(() => {
    if (!ready || !currentUserId) return;
    localStorage.setItem(
      dataKey(currentUserId),
      JSON.stringify({ active, entries }),
    );
  }, [ready, currentUserId, active, entries]);

  // Registrar actividad del usuario (dentro de la app) mientras hay cronómetro.
  useEffect(() => {
    if (!active) return;
    const mark = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, mark, { passive: true }),
    );
    return () =>
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
  }, [active]);

  // Tick de 1s: actualiza el reloj y detecta inactividad.
  useEffect(() => {
    if (!active) return;
    const idleSeconds = (() => {
      const raw = Number(localStorage.getItem("curva.idleSeconds"));
      return raw > 0 ? raw : DEFAULT_IDLE_SECONDS;
    })();
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const idleFor = (t - lastActivity.current) / 1000;
      if (idleFor >= idleSeconds) {
        setNudge((prev) =>
          prev ? prev : { taskId: active.taskId, idleSince: lastActivity.current },
        );
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const setCurrentUser = (id: string | null) => {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
    setCurrentUserId(id);
    setNudge(null);
    lastActivity.current = Date.now();
    if (id) {
      try {
        const raw = localStorage.getItem(dataKey(id));
        const parsed = raw ? JSON.parse(raw) : { active: null, entries: [] };
        setActive(parsed.active ?? null);
        setEntries(parsed.entries ?? []);
      } catch {
        setActive(null);
        setEntries([]);
      }
    } else {
      setActive(null);
      setEntries([]);
    }
  };

  const logout = () => setCurrentUser(null);

  // Marca actividad: lo usa el idle del SISTEMA (escritorio) para resetear el
  // contador cuando hay actividad en CUALQUIER app, no solo en la ventana de CURVA.
  const markActivity = () => {
    lastActivity.current = Date.now();
  };
  const setFocus = (f: FocusApp) => setFocusApp(f);

  const start = (taskId: string) => {
    const startedAt = Date.now();
    setActive((prev) => {
      if (prev && currentUserId) {
        pushEntry(currentUserId, prev.taskId, prev.startedAt, startedAt);
      }
      return { taskId, startedAt };
    });
    lastActivity.current = startedAt;
    setNudge(null);
    setNow(startedAt);
  };

  const stop = () => {
    if (!active || !currentUserId) return;
    pushEntry(currentUserId, active.taskId, active.startedAt, Date.now());
    setActive(null);
    setNudge(null);
  };

  // El usuario confirma que SÍ estaba trabajando: el hueco cuenta, seguimos corriendo.
  const keepIdle = () => {
    lastActivity.current = Date.now();
    setNudge(null);
  };

  // El usuario se había ido: cerramos el tramo hasta el último momento activo
  // (sin contar el hueco) y reiniciamos desde ahora.
  const discardIdle = () => {
    if (!active || !currentUserId || !nudge) {
      setNudge(null);
      return;
    }
    pushEntry(currentUserId, active.taskId, active.startedAt, nudge.idleSince);
    const restartedAt = Date.now();
    setActive({ taskId: active.taskId, startedAt: restartedAt });
    lastActivity.current = restartedAt;
    setNow(restartedAt);
    setNudge(null);
  };

  const elapsed = active
    ? Math.max(0, Math.round((now - active.startedAt) / 1000))
    : 0;

  const sessionSecondsForTask = (taskId: string) =>
    entries.filter((e) => e.taskId === taskId).reduce((a, e) => a + e.seconds, 0);

  const loggedSecondsToday = entries.reduce((a, e) => a + e.seconds, 0);

  const value: AppState = {
    ready,
    currentUserId,
    setCurrentUser,
    logout,
    active,
    entries,
    elapsed,
    start,
    stop,
    nudge,
    keepIdle,
    discardIdle,
    markActivity,
    focusApp,
    setFocus,
    sessionSecondsForTask,
    loggedSecondsToday,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return ctx;
}
