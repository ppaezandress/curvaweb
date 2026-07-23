"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { PILOT } from "@/lib/pilot-flags";
import { dayKey } from "@/lib/streaks";

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
  // Ciclo de vida frente a Notion (evita el DOBLE CONTEO tramo-local + rollup):
  //  posted  = NotionSync confirmó la escritura (guardamos el id de la página).
  //  synced  = el baseline (rollup "Horas registradas") ya lo absorbió tras un reload
  //            → deja de sumarse localmente por-tarea (el baseline ya lo cuenta).
  posted?: boolean;
  synced?: boolean;
  notionId?: string;
  // Baseline (rollup "Horas registradas", en segundos) de la tarea EN EL MOMENTO en que
  // NotionSync confirmó la escritura de este tramo. Sirve para no marcar `synced` hasta que
  // el baseline haya CRECIDO lo suficiente para absorber el tramo (Notion indexa con lag).
  baselineAtPost?: number;
};

type ActiveTimer = {
  taskId: string;
  startedAt: number;
} | null;

// Relojes de IA corriendo en paralelo (uno por tarea que la IA está resolviendo).
// silent = lo puso el conector (Claude Code/Desktop); no registra entry propio y
// puede limpiarse si queda huérfano tras una recarga.
type AiTimer = { taskId: string; startedAt: number; silent?: boolean };

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
  removeEntry: (id: string) => void; // quitar un registro mal medido
  markEntryPosted: (id: string, notionId?: string, baselineAtPost?: number) => void; // NotionSync confirmó la escritura
  addManualEntry: (e: { taskId: string; seconds: number; endedAt: number; notionId?: string; baselineAtPost: number }) => void; // registro "a mano" → total de la tarea al instante
  reconcileEntries: (baselineByTask?: Record<string, number>) => void; // baseline fresco de Notion (por tarea, en segundos)

  // Timer "olvidado" detectado al reabrir (corría > 8h). Se avisa y NO se cuenta solo.
  staleTimer: ActiveTimer;
  dismissStaleTimer: () => void;

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
  closeTask: (taskId: string, opts?: { discard?: boolean }) => void;

  // Revisión de inactividad al pausar
  pendingReview: PendingReview;
  resolveReview: (discount: boolean) => void;

  // Actividad / foco
  markActivity: () => void;
  focusApp: FocusApp;
  setFocus: (f: FocusApp) => void;

  sessionSecondsForTask: (taskId: string) => number;
  loggedSecondsToday: number;

  // Tiempo con IA (captura automática): apagado por defecto, opt-in en Ajustes.
  // Cuando está off, se oculta toda la UI de IA y AISync no reacciona al conector.
  aiEnabled: boolean;
  setAiEnabled: (v: boolean) => void;

  // Rol: admin (Andrés/Balmori) ve la data de todos + dashboard del equipo.
  // Los demás solo su propia data + la capa social. Muro individuo/equipo.
  isAdmin: boolean;
  adminResolved: boolean; // true cuando ya sabemos el rol (evita rebotar admins al cargar)
};

const AppContext = createContext<AppState | null>(null);

const SESSION_KEY = "curva.session.user";
const dataKey = (userId: string) => `curva.timer.${userId}`;
const aiEnabledKey = (userId: string) => `curva.aiEnabled.${userId}`;
// Opt-in: solo está "on" si el usuario lo activó explícitamente en este dispositivo.
function readAiEnabled(userId: string): boolean {
  try { return localStorage.getItem(aiEnabledKey(userId)) === "1"; } catch { return false; }
}

// Gracia de inactividad. En ESCRITORIO (Tauri) hay idle real del sistema (lee/escribe en
// cualquier app) → 5 min basta. En el NAVEGADOR no se puede saber si trabajas en otra app
// (leer un PDF, el cel, una llamada NO generan eventos en la pestaña), así que marcar
// inactivo ahí da falsos positivos. Por eso en navegador la gracia es enorme: solo flaggea
// cronómetros claramente OLVIDADOS (ej. dejado toda la noche), nunca trabajo real.
const DEFAULT_GRACE_SECONDS = 300; // escritorio (Tauri), con idle del sistema
const BROWSER_GRACE_SECONDS = 6 * 3600; // navegador: prácticamente no marca inactivo
// Timer "olvidado": si al reabrir el cronómetro llevaba más de esto, no se cuenta solo.
const STALE_TIMER_MS = 8 * 3600 * 1000;
// Tolerancia (segundos) al comparar el baseline de Notion contra los tramos locales: el
// rollup "Horas registradas" suma "Minutos" redondeados a 1 decimal (0.1 min = 6 s), así que
// el baseline puede quedar unos segundos por debajo del tramo real. Absorbe ese redondeo sin
// marcar `synced` demasiado pronto (lo que vaciaría el total → el bug de "Continuar = 0 min").
const SYNC_TOLERANCE_SECONDS = 10;
function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
function graceMs() {
  if (typeof window === "undefined") return DEFAULT_GRACE_SECONDS * 1000;
  const raw = Number(localStorage.getItem("curva.graceSeconds"));
  if (raw > 0) return raw * 1000; // override manual (demo/test) siempre gana
  return (isTauri() ? DEFAULT_GRACE_SECONDS : BROWSER_GRACE_SECONDS) * 1000;
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

/**
 * Prepara los tramos guardados en localStorage para volver a montarlos.
 *
 * El total de una tarea es `baseline de Notion + tramos locales !synced + sesión viva`. Un
 * tramo se marca `synced` cuando el rollup "Horas registradas" de Notion ya lo absorbió; hasta
 * entonces se cuenta localmente. Ese `synced` se PERSISTE junto al tramo.
 *
 * Antes, al rehidratar se marcaban TODOS `synced` a ciegas. Eso rompía el caso de un tramo de
 * HOY que se posteó pero el rollup aún no había indexado (lag de Notion): al recargar quedaba
 * `synced` sin estar en el baseline → se PERDÍA del total de la tarea. El día seguía bien
 * porque se calcula de los registros crudos de Notion, no del baseline — justo el síntoma
 * reportado ("el día acumula pero el contador de la tarea se reinicia").
 *
 * Ahora: los tramos de días PREVIOS sí se marcan synced (el rollup ya los tiene, evita
 * doble-conteo), pero los de HOY conservan su estado real para que `reconcileEntries` los
 * sincronice contra el baseline REAL cuando cargue Notion.
 */
export function hydrateEntries(raw: TimeEntry[], now: number): TimeEntry[] {
  const today = dayKey(now);
  return (raw ?? []).map((e) => ({
    ...e,
    inactiveSeconds: e.inactiveSeconds ?? 0,
    mode: e.mode ?? "manual",
    synced: dayKey(e.endedAt) !== today ? true : (e.synced ?? false),
  }));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveTimer>(null);
  const [aiActive, setAiActive] = useState<AiTimer[]>([]);
  const [openTasks, setOpenTasks] = useState<string[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [pendingReview, setPendingReview] = useState<PendingReview>(null);
  const [staleTimer, setStaleTimer] = useState<ActiveTimer>(null);
  const [focusApp, setFocusApp] = useState<FocusApp>(null);
  const [autoResumed, setAutoResumed] = useState<string | null>(null);
  const [aiEnabled, setAiEnabledState] = useState(false);
  const [authUid, setAuthUid] = useState<string | null>(null); // id de Supabase (para timer_sessions cross-device)
  const [isAdmin, setIsAdmin] = useState(false); // rol (profiles.is_admin)
  const [adminResolved, setAdminResolved] = useState(false);

  const counter = useRef(0);
  // Última sesión que sincronizamos/adoptamos (evita eco entre upsert ↔ realtime).
  const syncedRef = useRef<{ taskId: string; startedAt: number } | null>(null);
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
          if (data.user) setAuthUid(data.user.id);
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
        setAiEnabledState(readAiEnabled(userId));
        try {
          const raw = localStorage.getItem(dataKey(userId));
          if (raw) {
            const parsed = JSON.parse(raw);
            // Timer olvidado: si el cronómetro llevaba corriendo > STALE (p.ej. lo
            // dejaste toda la noche / apagaste la compu), NO lo restauramos corriendo
            // ni lo contamos — lo pasamos a un aviso para que registres a mano lo real.
            const restored = parsed.active ?? null;
            if (restored && Date.now() - restored.startedAt > STALE_TIMER_MS) {
              setStaleTimer(restored);
            } else {
              setActive(restored);
            }
            // Relojes de IA olvidados (> STALE, p. ej. dejados toda la noche) NO se restauran
            // corriendo: se descartan para que no sigan acumulando elapsed (gemelo del guard
            // del timer manual de arriba).
            setAiActive((parsed.aiActive ?? []).filter((a: AiTimer) => Date.now() - a.startedAt <= STALE_TIMER_MS));
            // Rehidratación consciente del estado de sync (ver hydrateEntries): los tramos de
            // HOY pendientes de que el rollup los absorba siguen contando en su tarea.
            setEntries(hydrateEntries(parsed.entries ?? [], Date.now()));
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

  // ── Reloj cross-device (solo la sesión ACTIVA) vía Supabase Realtime ──
  // Adopta una sesión remota SIN registrar entry (es estado en vivo, no una corrida que cierra).
  const adoptActive = (taskId: string, startedAt: number, remoteOpen: string[]) => {
    syncedRef.current = { taskId, startedAt };
    setActive({ taskId, startedAt });
    setOpenTasks((p) => Array.from(new Set([...p, ...remoteOpen, taskId])));
    resetRun(startedAt);
  };
  const adoptClear = () => {
    syncedRef.current = null;
    setActive(null);
    resetRun(Date.now());
  };

  // Empuja MI sesión activa al server para que otros dispositivos la vean (best-effort).
  useEffect(() => {
    if (!ready || !currentUserId || !authUid || !supabaseConfigured()) return;
    const cur = active ? { taskId: active.taskId, startedAt: active.startedAt } : null;
    const prev = syncedRef.current;
    const same = (!cur && !prev) || (!!cur && !!prev && cur.taskId === prev.taskId && cur.startedAt === prev.startedAt);
    if (same) return; // sin cambio real → no eco
    syncedRef.current = cur;
    const sb = getSupabase();
    if (!sb) return;
    if (cur) {
      sb.from("timer_sessions").upsert({
        user_id: authUid, task_id: cur.taskId,
        started_at: new Date(cur.startedAt).toISOString(),
        open_tasks: openTasksRef.current, updated_at: new Date().toISOString(),
      }).then(() => {});
    } else {
      sb.from("timer_sessions").delete().eq("user_id", authUid).then(() => {});
    }
  }, [ready, currentUserId, authUid, active]);

  // Escucha MI fila: si otro dispositivo arranca/cambia/detiene, lo adopto aquí.
  useEffect(() => {
    if (!ready || !authUid || !supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    const ch = sb
      .channel(`timer-${authUid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "timer_sessions", filter: `user_id=eq.${authUid}` },
        (payload: { eventType: string; new: { task_id?: string | null; started_at?: string | null; open_tasks?: string[] | null } | null }) => {
          if (payload.eventType === "DELETE") { if (activeRef.current) adoptClear(); return; }
          const row = payload.new;
          if (!row?.task_id || !row.started_at) { if (activeRef.current) adoptClear(); return; }
          const startedAt = new Date(row.started_at).getTime();
          const cur = activeRef.current;
          if (!cur) adoptActive(row.task_id, startedAt, row.open_tasks || []);
          else if (cur.taskId === row.task_id && cur.startedAt !== startedAt) adoptActive(row.task_id, startedAt, row.open_tasks || []);
          // distinto task corriendo localmente → ignora (gana lo local; mi upsert reconcilia)
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [ready, authUid]);

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
    setAiEnabledState(id ? readAiEnabled(id) : false);
    resetRun(Date.now());
    if (id) {
      try {
        const raw = localStorage.getItem(dataKey(id));
        const parsed = raw ? JSON.parse(raw) : { active: null, aiActive: [], entries: [], openTasks: [] };
        setActive(parsed.active ?? null);
        setAiActive((parsed.aiActive ?? []).filter((a: AiTimer) => Date.now() - a.startedAt <= STALE_TIMER_MS));
        setEntries(hydrateEntries(parsed.entries ?? [], Date.now()));
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

  const setAiEnabled = (v: boolean) => {
    setAiEnabledState(v);
    const uid = userRef.current;
    if (uid) { try { localStorage.setItem(aiEnabledKey(uid), v ? "1" : "0"); } catch { /* */ } }
    // Al apagar, cierra los relojes de IA en curso (registra los ✨IA a mano, descarta los del conector).
    if (!v) aiActiveRef.current.forEach((a) => closeAI(a.taskId, Date.now()));
  };

  // Cierra el reloj de IA de una tarea (registra el tramo) y lo quita de la lista.
  const closeAI = (taskId: string, endedAt: number) => {
    const timer = aiActiveRef.current.find((a) => a.taskId === taskId);
    // No registra si es "silent" (lo registra el conector de IA en Notion).
    // El flag vive en el Set (sesión actual) o en el propio timer (sobrevive recargas).
    if (timer && userRef.current && !silentAIRef.current.has(taskId) && !timer.silent) {
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
    const next = [...aiActiveRef.current, { taskId, startedAt, silent: !!opts?.silent }];
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

  // Quitar un registro de tiempo ya guardado (p. ej. uno mal medido).
  const removeEntry = (id: string) => setEntries((e) => e.filter((x) => x.id !== id));

  // NotionSync confirmó la escritura del tramo (guardamos el id de la página de Notion y el
  // baseline de la tarea EN ESE INSTANTE, para saber cuánto debe crecer antes de dar por
  // sincronizado el tramo). Sigue contando localmente hasta que el baseline lo absorba.
  const markEntryPosted = (id: string, notionId?: string, baselineAtPost?: number) =>
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, posted: true, notionId, baselineAtPost } : x)));

  // Registra un tramo del botón "Registrar tiempo" (a mano) en la maquinaria local, para que
  // cuente en el total de la TARJETA de la tarea de inmediato — como un tramo del cronómetro —
  // hasta que el rollup de Notion lo absorba. Antes el manual solo iba a recentEntries
  // (data-context) + Notion, así que el historial y "Trabajado hoy" lo mostraban pero el total
  // de la tarjeta NO se movía hasta que Notion indexaba (queja de Emiliano ×2 / Ivana). El
  // `notionId` evita el doble conteo: "Trabajado hoy" ya deduplica por notionId, y reconcile lo
  // marca synced cuando el baseline crece.
  const addManualEntry = (e: { taskId: string; seconds: number; endedAt: number; notionId?: string; baselineAtPost: number }) => {
    if (!e.taskId || e.seconds <= 0) return;
    counter.current += 1;
    setEntries((prev) => [
      ...prev,
      {
        id: `m${e.endedAt}-${counter.current}`,
        taskId: e.taskId,
        userId: userRef.current ?? "",
        startedAt: e.endedAt - e.seconds * 1000,
        endedAt: e.endedAt,
        seconds: e.seconds,
        inactiveSeconds: 0,
        mode: "manual",
        posted: true,
        synced: false,
        notionId: e.notionId,
        baselineAtPost: e.baselineAtPost,
      },
    ]);
  };

  // Reconciliación: se llama cuando llega baseline fresco de Notion (reload de /api/data),
  // recibiendo el baseline por tarea (segundos). Un tramo posteado pasa a `synced` (deja de
  // sumarse localmente) SOLO cuando el baseline de su tarea creció lo suficiente para incluirlo
  // — antes se marcaba synced en cuanto se posteaba, pero el rollup de Notion indexa con lag,
  // así que el tramo se vaciaba del total ANTES de que el baseline lo tuviera → "Continuar = 0
  // min" / la celebración mostraba "1m". Por tarea, en orden cronológico, se acumulan los
  // tramos pendientes y se marcan synced mientras el crecimiento del baseline (desde el
  // baseline observado al postear el más antiguo) los cubra; si no crecen aún, se quedan
  // locales (cuentan) y se reintenta en el próximo reload. Sin baseline (fallback), conserva el
  // comportamiento previo. Luego poda los synced de días PREVIOS (no aportan a "hoy").
  const reconcileEntries = (baselineByTask?: Record<string, number>) =>
    setEntries((e) => {
      const today = dayKey(Date.now());
      const toSync = new Set<string>();
      if (baselineByTask) {
        const byTask = new Map<string, TimeEntry[]>();
        for (const x of e) {
          if (x.posted && !x.synced) {
            const arr = byTask.get(x.taskId);
            if (arr) arr.push(x);
            else byTask.set(x.taskId, [x]);
          }
        }
        for (const [taskId, list] of byTask) {
          const base = baselineByTask[taskId] ?? 0;
          const sorted = [...list].sort((a, b) => a.endedAt - b.endedAt);
          const minAtPost = Math.min(...sorted.map((x) => x.baselineAtPost ?? 0));
          const growth = base - minAtPost;
          let acc = 0;
          for (const x of sorted) {
            acc += x.seconds;
            if (growth >= acc - SYNC_TOLERANCE_SECONDS) toSync.add(x.id);
            else break; // el baseline aún no cubre este tramo → los siguientes tampoco
          }
        }
      } else {
        for (const x of e) if (x.posted && !x.synced) toSync.add(x.id);
      }
      return e
        .map((x) => (toSync.has(x.id) ? { ...x, synced: true } : x))
        .filter((x) => !(x.synced && dayKey(x.endedAt) !== today));
    });
  // Descartar el aviso de "timer olvidado" (no cuenta ese tiempo).
  const dismissStaleTimer = () => setStaleTimer(null);

  // Multi-tarea
  const openTask = (taskId: string) =>
    setOpenTasks((p) => (p.includes(taskId) ? p : [...p, taskId]));
  const switchTo = (taskId: string) => start(taskId);
  const pause = () => stop();
  // Cerrar una tarea del dock. Por defecto registra el tramo en curso (stop). Con
  // { discard:true } lo DESCARTA sin registrar: para cuando picaste una tarea sin querer y
  // el cronómetro arrancó (feedback de Diana: "empezó a contar, ¿cómo la paro?").
  const closeTask = (taskId: string, opts?: { discard?: boolean }) => {
    if (activeRef.current?.taskId === taskId) {
      if (opts?.discard) { setActive(null); resetRun(Date.now()); }
      else stop();
    }
    if (aiActiveRef.current.some((a) => a.taskId === taskId)) stopAI(taskId);
    setOpenTasks((p) => p.filter((t) => t !== taskId));
  };

  const isAI = (taskId: string) => aiActive.some((a) => a.taskId === taskId);

  // Segundos LOCALES por tarea = solo tramos que el baseline de Notion aún NO absorbió
  // (!synced). Los synced ya están en task.baselineSeconds → sumarlos aquí los contaría dos
  // veces. El tramo vivo (elapsed) lo añaden los consumidores aparte.
  const sessionSecondsForTask = (taskId: string) =>
    entries.filter((e) => e.taskId === taskId && !e.synced).reduce((a, e) => a + e.seconds, 0);
  // "Registrado hoy" = tramos cuyo fin es HOY (local), estén o no sincronizados. Es un total
  // del día independiente (no se combina con el baseline), así que cuenta una sola vez.
  const todayKey = dayKey(Date.now());
  const loggedSecondsToday = entries
    .filter((e) => dayKey(e.endedAt) === todayKey)
    .reduce((a, e) => a + e.seconds, 0);

  // Rol: refresca is_admin cuando cambia el usuario (hidratación o tras login).
  useEffect(() => {
    if (!supabaseConfigured() || !currentUserId) { setIsAdmin(false); setAdminResolved(true); return; }
    const sb = getSupabase();
    if (!sb) { setAdminResolved(true); return; }
    let cancelled = false;
    setAdminResolved(false);
    (async () => {
      try {
        const { data: u } = await sb.auth.getUser();
        if (cancelled) return;
        if (u.user) {
          const { data: prof } = await sb.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
          if (!cancelled) setIsAdmin(!!prof?.is_admin);
        }
      } catch { /* sin rol → no admin */ }
      finally { if (!cancelled) setAdminResolved(true); }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const value: AppState = {
    ready, currentUserId, setCurrentUser, logout, isAdmin, adminResolved,
    active, entries, start, stop, removeEntry, markEntryPosted, addManualEntry, reconcileEntries,
    staleTimer, dismissStaleTimer,
    aiActive, startAI, stopAI, toggleAI, isAI, autoResumed,
    openTasks, openTask, switchTo, pause, closeTask,
    pendingReview, resolveReview,
    markActivity, focusApp, setFocus,
    sessionSecondsForTask, loggedSecondsToday,
    // Piloto: el encuadre de IA está gateado off. Apaga AITodayCard, ✨IA, dock IA, AISync.
    aiEnabled: PILOT.aiTime && aiEnabled, setAiEnabled,
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
