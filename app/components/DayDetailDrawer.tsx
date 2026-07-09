"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X, Clock3, Sparkles, Pencil, CalendarDays } from "lucide-react";
import { backdrop, DUR_BASE, EASE_CURVA } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useTimeRecords } from "@/lib/use-time-records";
import { formatDuration } from "@/lib/format";
import { useOverlay } from "@/lib/use-overlay";

// Paleta categórica de marca, ordenada para separar el peor par CVD (púrpura↔indigo quedan
// en extremos, nunca adyacentes). El color sigue al PROYECTO (entidad fija, orden estable).
const PALETTE = [
  "var(--color-curva-purple)",
  "var(--color-curva-blue)",
  "var(--color-curva-teal)",
  "var(--color-curva-pink)",
  "var(--color-curva-indigo)",
];
const OTHER = "var(--muted)";

// Ventana de horas del día que enmarca el trabajo real (no 0-24 siempre vacío).
const H = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hourLabel = (h: number) => { const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${ap}`; };

type Session = {
  id: string;
  start: number;
  minutes: number;
  taskId: string;
  key: string;      // proyecto (o interno / sin proyecto)
  project: string;  // etiqueta visible
  client?: string;
  task?: string;
  origin?: "timer" | "manual";
  mode?: "manual" | "ai";
};

// Panel "Tu día": la jornada de HOY como una gráfica de horarios + desglose por proyecto +
// bitácora de sesiones. Se abre al clicar "Trabajado hoy". Solo lectura.
export function DayDetailDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentUserId, entries } = useApp();
  const { taskById, projectById, clientById, memberById, recentEntries } = useData();
  const { records } = useTimeRecords();
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  useOverlay(open, onClose);

  const me = currentUserId ? memberById[currentUserId] : undefined;

  // Sesiones de HOY (mismas fuentes que "Trabajado hoy": Notion + recién creados + tramos
  // locales aún no sincronizados), normalizadas e itemizadas por proyecto.
  const model = useMemo(() => {
    const start0 = new Date().setHours(0, 0, 0, 0);
    const myName = (me?.name || "").trim();

    const meta = (taskId: string) => {
      const t = taskId ? taskById[taskId] : undefined;
      const p = t ? projectById[t.projectId] : undefined;
      const c = t ? clientById[t.clientId] || (p ? clientById[p.clientId] : undefined) : undefined;
      const key = p?.id || (t?.internal ? "interno" : t ? `task:${t.id}` : "sin");
      const project = p?.name || (t?.internal ? "Interno" : t?.name || "Sin proyecto");
      return { key, project, client: c?.name, task: t?.name };
    };

    const notionKnown = new Set<string>();
    const sessions: Session[] = [];
    // Notion + recién creados (dedupe por id), míos, de hoy.
    const recBase = records.filter((r) => (r.person || "").trim() === myName);
    const recIds = new Set(recBase.map((r) => r.id));
    const recAll = [...recBase, ...recentEntries.filter((r) => (r.person || "").trim() === myName && !recIds.has(r.id))];
    for (const r of recAll) {
      const ms = new Date(r.start).getTime();
      if (!(ms >= start0) || !(r.minutes > 0)) continue;
      notionKnown.add(r.id);
      sessions.push({ id: r.id, start: ms, minutes: r.minutes, taskId: r.taskId, origin: r.origin, mode: r.mode, ...meta(r.taskId) });
    }
    // Tramos locales de hoy aún no absorbidos por Notion (cronómetro de esta sesión).
    for (const e of entries) {
      if (e.synced || !(e.endedAt >= start0) || (e.seconds || 0) <= 0) continue;
      if (e.notionId && notionKnown.has(e.notionId)) continue;
      const mins = Math.round((e.seconds / 60) * 10) / 10;
      sessions.push({ id: e.id, start: e.startedAt, minutes: mins, taskId: e.taskId, origin: "timer", ...meta(e.taskId) });
    }
    sessions.sort((a, b) => a.start - b.start);

    // Color por proyecto en orden de aparición (fijo). >5 → "Otro".
    const order: string[] = [];
    for (const s of sessions) if (!order.includes(s.key)) order.push(s.key);
    const colorByKey: Record<string, string> = {};
    order.forEach((k, i) => { colorByKey[k] = i < PALETTE.length ? PALETTE[i] : OTHER; });

    // Totales por proyecto (para el desglose) y del día.
    const byProject = new Map<string, { key: string; label: string; client?: string; minutes: number }>();
    for (const s of sessions) {
      const cur = byProject.get(s.key) || { key: s.key, label: s.project, client: s.client, minutes: 0 };
      cur.minutes += s.minutes;
      byProject.set(s.key, cur);
    }
    const projects = [...byProject.values()].sort((a, b) => b.minutes - a.minutes);
    const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);
    const manualMin = sessions.filter((s) => s.origin === "manual").reduce((a, s) => a + s.minutes, 0);

    // Ventana horaria: enmarca de la 1ª a la última sesión, con colchón y mínimo 4h.
    let winStart: number, winEnd: number;
    if (sessions.length) {
      const first = Math.min(...sessions.map((s) => s.start));
      const last = Math.max(...sessions.map((s) => s.start + s.minutes * 60000));
      winStart = new Date(first).setMinutes(0, 0, 0) - 0;
      winEnd = Math.ceil(last / H) * H;
      if (winEnd - winStart < 4 * H) winEnd = winStart + 4 * H;
    } else {
      const now = Date.now();
      winStart = new Date(now).setHours(8, 0, 0, 0);
      winEnd = new Date(now).setHours(20, 0, 0, 0);
    }
    const span = winEnd - winStart;
    const ticks: number[] = [];
    for (let t = winStart; t <= winEnd + 1; t += Math.max(H, Math.ceil(span / 6 / H) * H)) ticks.push(t);

    return { sessions, projects, colorByKey, totalMin, manualMin, winStart, winEnd, span, ticks };
  }, [records, recentEntries, entries, me, taskById, projectById, clientById]);

  if (!mounted) return null;

  const { sessions, projects, colorByKey, totalMin, manualMin, winStart, span, ticks } = model;
  const now = Date.now();
  const nowPct = span > 0 ? ((now - winStart) / span) * 100 : -1;
  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const hoveredSession = sessions.find((s) => s.id === hover);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={backdrop}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="fixed inset-0 z-50 flex justify-end bg-ink/30"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: DUR_BASE, ease: EASE_CURVA }}
            className="flex h-full w-full max-w-md flex-col bg-[var(--surface-solid)] shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-caption font-medium text-muted"><CalendarDays size={13} /> Tu día</p>
                <h2 className="font-display text-lg font-bold capitalize leading-tight text-fg">{todayLabel}</h2>
              </div>
              <button onClick={onClose} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2 focus-ring"><X size={18} /></button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* Total del día */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-caption font-medium text-muted">Trabajado hoy</p>
                  <p className="tabular font-display text-[2.4rem] font-bold leading-none text-fg">{formatDuration(totalMin * 60)}</p>
                </div>
                <div className="text-right text-caption text-muted">
                  <p>{sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"}</p>
                  {manualMin > 0 && <p className="mt-0.5">{formatDuration(manualMin * 60)} a mano</p>}
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="rounded-card border border-dashed border-line py-10 text-center">
                  <p className="text-body font-medium text-fg">Aún no mides nada hoy</p>
                  <p className="mt-1 text-caption text-muted">Dale ▶ a una tarea o registra tiempo a mano; aquí verás tu jornada.</p>
                </div>
              ) : (
                <>
                  {/* ── Gráfica del día: horarios trabajados ── */}
                  <section aria-label="Horarios trabajados hoy">
                    <p className="mb-2 text-caption font-semibold text-muted">A qué hora trabajaste</p>
                    <div className="rounded-card border border-line bg-surface-2/60 p-3.5">
                      {/* Tooltip flotante de la sesión con hover */}
                      <div className="mb-2 h-8">
                        {hoveredSession ? (
                          <div className="rounded-control bg-[var(--surface-solid)] px-3 py-1.5 text-caption shadow-soft">
                            <span className="font-semibold text-fg">{hoveredSession.task || hoveredSession.project}</span>
                            <span className="text-muted"> · {hhmm(hoveredSession.start)}–{hhmm(hoveredSession.start + hoveredSession.minutes * 60000)} · {formatDuration(hoveredSession.minutes * 60)}</span>
                          </div>
                        ) : (
                          <p className="px-1 text-caption text-muted/80">Pasa el cursor por un bloque para ver el detalle.</p>
                        )}
                      </div>
                      {/* Pista de la jornada */}
                      <div className="relative h-12 overflow-hidden rounded-control bg-surface ring-1 ring-inset ring-line">
                        {/* línea "ahora" */}
                        {nowPct >= 0 && nowPct <= 100 && (
                          <div className="absolute inset-y-0 z-20 w-px bg-fg/40" style={{ left: `${nowPct}%` }} aria-hidden />
                        )}
                        {sessions.map((s) => {
                          const left = ((s.start - winStart) / span) * 100;
                          const width = ((s.minutes * 60000) / span) * 100;
                          const on = hover === s.id;
                          return (
                            <button
                              key={s.id}
                              onMouseEnter={() => setHover(s.id)}
                              onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                              onFocus={() => setHover(s.id)}
                              onBlur={() => setHover((h) => (h === s.id ? null : h))}
                              aria-label={`${s.task || s.project}, ${hhmm(s.start)} a ${hhmm(s.start + s.minutes * 60000)}, ${formatDuration(s.minutes * 60)}`}
                              className="absolute top-1/2 z-10 h-8 -translate-y-1/2 rounded-[5px] ring-2 ring-[var(--surface-solid)] transition focus:outline-none"
                              style={{
                                left: `${left}%`,
                                width: `max(0.5rem, ${width}%)`,
                                background: colorByKey[s.key],
                                opacity: on || !hover ? 1 : 0.5,
                                transform: `translateY(-50%) scaleY(${on ? 1.12 : 1})`,
                              }}
                            />
                          );
                        })}
                      </div>
                      {/* Ticks de hora */}
                      <div className="relative mt-1.5 h-3 text-caption tabular text-muted">
                        {ticks.map((t) => {
                          const left = ((t - winStart) / span) * 100;
                          if (left < -1 || left > 101) return null;
                          return <span key={t} className="absolute -translate-x-1/2" style={{ left: `${Math.min(98, Math.max(2, left))}%` }}>{hourLabel(new Date(t).getHours())}</span>;
                        })}
                      </div>
                    </div>
                  </section>

                  {/* ── Desglose por proyecto ── */}
                  <section aria-label="Tiempo por proyecto">
                    <p className="mb-2.5 text-caption font-semibold text-muted">En qué proyectos</p>
                    <div className="space-y-3">
                      {projects.map((p) => {
                        const pctDay = totalMin > 0 ? Math.round((p.minutes / totalMin) * 100) : 0;
                        return (
                          <div key={p.key}>
                            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByKey[p.key] }} aria-hidden />
                                <span className="truncate font-medium text-fg">{p.label}</span>
                                {p.client && <span className="hidden shrink-0 text-caption text-muted sm:inline">· {p.client}</span>}
                              </span>
                              <span className="tabular shrink-0 font-semibold text-fg">{formatDuration(p.minutes * 60)} <span className="font-normal text-muted">{pctDay}%</span></span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                              <div className="h-full rounded-full" style={{ width: `${Math.max(pctDay, 2)}%`, background: colorByKey[p.key] }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* ── Bitácora de sesiones (respaldo tabla) ── */}
                  <section aria-label="Sesiones de hoy">
                    <p className="mb-2.5 text-caption font-semibold text-muted">Bitácora</p>
                    <div className="space-y-1.5">
                      {[...sessions].reverse().map((s) => (
                        <div
                          key={s.id}
                          onMouseEnter={() => setHover(s.id)}
                          onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                          className={`flex items-center gap-3 rounded-control border px-3 py-2 transition ${hover === s.id ? "border-accent/40 bg-surface-2/60" : "border-line"}`}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByKey[s.key] }} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{s.task || s.project}</p>
                            <p className="tabular text-caption text-muted">{hhmm(s.start)}–{hhmm(s.start + s.minutes * 60000)}{s.client ? ` · ${s.client}` : ""}</p>
                          </div>
                          {s.mode === "ai"
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-caption font-semibold text-accent"><Sparkles size={11} /> IA</span>
                            : s.origin === "manual"
                              ? <span className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-caption font-medium text-muted"><Pencil size={10} /> A mano</span>
                              : null}
                          <span className="tabular flex shrink-0 items-center gap-1 text-sm font-semibold text-fg"><Clock3 size={12} className="text-muted" /> {formatDuration(s.minutes * 60)}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
