"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X, Clock3, Sparkles, Pencil, CalendarDays, ArrowRight, Target, Briefcase, Users, TrendingUp, TrendingDown } from "lucide-react";
import { backdrop, DUR_BASE, EASE_CURVA } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useTimeRecords } from "@/lib/use-time-records";
import { formatDuration } from "@/lib/format";
import { useOverlay } from "@/lib/use-overlay";
import { analyzeDay } from "@/lib/day-analytics";

const H = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hourLabel = (h: number) => { const ap = h < 12 ? "a" : "p"; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}${ap}`; };

// Panel "Tu día": vistazo del día de HOY — KPIs + gráfica de horarios + desglose por proyecto
// + bitácora. Un botón lleva al análisis profundo (/dia). Solo lectura.
export function DayDetailDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { currentUserId, entries } = useApp();
  const { taskById, projectById, clientById, taskTypeById, memberById, recentEntries } = useData();
  const { records } = useTimeRecords();
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  useOverlay(open, onClose);

  const me = currentUserId ? memberById[currentUserId] : undefined;

  const a = useMemo(() => analyzeDay(
    { records, recentEntries, entries, myName: (me?.name || "").trim(), dayStart: new Date().setHours(0, 0, 0, 0), now: Date.now(), priorRecords: records, priorDays: 30 },
    { taskById, projectById, clientById, taskTypeById },
  ), [records, recentEntries, entries, me, taskById, projectById, clientById, taskTypeById]);

  if (!mounted) return null;

  const colorByKey: Record<string, string> = {};
  a.byProject.forEach((g) => { colorByKey[g.key] = g.color; });
  const now = Date.now();

  // Ventana horaria de la timeline: enmarca 1ª→última sesión, mín 4h.
  let winStart: number, span: number;
  if (a.sessions.length) {
    winStart = new Date(a.firstStart).setMinutes(0, 0, 0);
    let winEnd = Math.ceil(a.lastEnd / H) * H;
    if (winEnd - winStart < 4 * H) winEnd = winStart + 4 * H;
    span = winEnd - winStart;
  } else { winStart = new Date().setHours(8, 0, 0, 0); span = 12 * H; }
  const ticks: number[] = [];
  for (let t = winStart; t <= winStart + span + 1; t += Math.max(H, Math.ceil(span / 6 / H) * H)) ticks.push(t);
  const nowPct = span > 0 ? ((now - winStart) / span) * 100 : -1;
  const todayLabel = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const hoveredSession = a.sessions.find((s) => s.id === hover);

  const goAnalysis = () => { onClose(); router.push("/dia"); };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div variants={backdrop} initial="hidden" animate="visible" exit="hidden" className="fixed inset-0 z-50 flex justify-end bg-ink/30" onClick={onClose}>
          <motion.div
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
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
              {/* Total + resumen */}
              <div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-caption font-medium text-muted">Trabajado hoy</p>
                    <p className="tabular font-display text-[2.4rem] font-bold leading-none text-fg">{formatDuration(a.total * 60)}</p>
                  </div>
                  <div className="text-right text-caption text-muted">
                    <p>{a.count} {a.count === 1 ? "sesión" : "sesiones"}</p>
                    {a.avgDayMin > 0 && (
                      <p className={`mt-0.5 inline-flex items-center gap-0.5 font-semibold ${a.deltaVsAvgPct >= 0 ? "text-success" : "text-muted"}`}>
                        {a.deltaVsAvgPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{a.deltaVsAvgPct >= 0 ? "+" : ""}{a.deltaVsAvgPct}% vs tu media
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {a.sessions.length === 0 ? (
                <div className="rounded-card border border-dashed border-line py-10 text-center">
                  <p className="text-body font-medium text-fg">Aún no mides nada hoy</p>
                  <p className="mt-1 text-caption text-muted">Dale ▶ a una tarea o registra tiempo a mano; aquí verás tu jornada.</p>
                </div>
              ) : (
                <>
                  {/* ── KPIs del día ── */}
                  <div className="grid grid-cols-3 gap-2.5">
                    <Kpi icon={<Target size={13} />} label="Foco" value={`${a.focusPct}%`} tone={a.focusPct >= 80 ? "success" : a.focusPct >= 60 ? "warn" : "muted"} />
                    <Kpi icon={<Briefcase size={13} />} label="Facturable" value={`${a.billablePct}%`} />
                    <Kpi icon={<Users size={13} />} label="Juntas" value={`${a.meetingPct}%`} />
                  </div>

                  {/* ── Gráfica del día ── */}
                  <section aria-label="Horarios trabajados hoy">
                    <p className="mb-2 text-caption font-semibold text-muted">A qué hora trabajaste</p>
                    <div className="rounded-card border border-line bg-surface-2/60 p-3.5">
                      <div className="mb-2 h-8">
                        {hoveredSession ? (
                          <div className="rounded-control bg-[var(--surface-solid)] px-3 py-1.5 text-caption shadow-soft">
                            <span className="font-semibold text-fg">{hoveredSession.task || hoveredSession.project}</span>
                            <span className="text-muted"> · {hhmm(hoveredSession.start)}–{hhmm(hoveredSession.end)} · {formatDuration(hoveredSession.minutes * 60)}</span>
                          </div>
                        ) : (
                          <p className="px-1 text-caption text-muted/80">Pasa el cursor por un bloque para ver el detalle.</p>
                        )}
                      </div>
                      <div className="relative h-12 overflow-hidden rounded-control bg-surface ring-1 ring-inset ring-line">
                        {nowPct >= 0 && nowPct <= 100 && <div className="absolute inset-y-0 z-20 w-px bg-fg/40" style={{ left: `${nowPct}%` }} aria-hidden />}
                        {a.sessions.map((s) => {
                          const left = ((s.start - winStart) / span) * 100;
                          const width = ((s.end - s.start) / span) * 100;
                          const on = hover === s.id;
                          return (
                            <button
                              key={s.id}
                              onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                              onFocus={() => setHover(s.id)} onBlur={() => setHover((h) => (h === s.id ? null : h))}
                              aria-label={`${s.task || s.project}, ${hhmm(s.start)} a ${hhmm(s.end)}, ${formatDuration(s.minutes * 60)}`}
                              className="absolute top-1/2 z-10 h-8 -translate-y-1/2 rounded-[5px] ring-2 ring-[var(--surface-solid)] transition focus:outline-none"
                              style={{ left: `${left}%`, width: `max(0.5rem, ${width}%)`, background: colorByKey[s.projectKey], opacity: on || !hover ? 1 : 0.5, transform: `translateY(-50%) scaleY(${on ? 1.12 : 1})` }}
                            />
                          );
                        })}
                      </div>
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
                      {a.byProject.map((p) => (
                        <div key={p.key}>
                          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                              <span className="truncate font-medium text-fg">{p.label}</span>
                              {p.sublabel && <span className="hidden shrink-0 text-caption text-muted sm:inline">· {p.sublabel}</span>}
                            </span>
                            <span className="tabular shrink-0 font-semibold text-fg">{formatDuration(p.minutes * 60)} <span className="font-normal text-muted">{p.pct}%</span></span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(p.pct, 2)}%`, background: p.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Ver análisis completo */}
                  <button onClick={goAnalysis} className="focus-ring flex w-full items-center justify-between gap-2 rounded-card border border-accent/30 bg-accent/5 px-4 py-3 text-left transition hover:border-accent hover:bg-accent/10 active:scale-[0.99]">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-accent">Ver análisis completo del día</span>
                      <span className="block truncate text-caption text-muted">Foco, ritmo, cambios de contexto, pilares y más</span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-accent" />
                  </button>

                  {/* ── Bitácora ── */}
                  <section aria-label="Sesiones de hoy">
                    <p className="mb-2.5 text-caption font-semibold text-muted">Bitácora</p>
                    <div className="space-y-1.5">
                      {[...a.sessions].reverse().map((s) => (
                        <div
                          key={s.id}
                          onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover((h) => (h === s.id ? null : h))}
                          className={`flex items-center gap-3 rounded-control border px-3 py-2 transition ${hover === s.id ? "border-accent/40 bg-surface-2/60" : "border-line"}`}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorByKey[s.projectKey] }} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{s.task || s.project}</p>
                            <p className="tabular text-caption text-muted">{hhmm(s.start)}–{hhmm(s.end)}{s.client ? ` · ${s.client}` : ""}</p>
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

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "success" | "warn" | "muted" }) {
  const c = tone === "success" ? "text-success" : tone === "warn" ? "text-warn" : "text-fg";
  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <p className="flex items-center gap-1 text-caption font-medium text-muted">{icon} {label}</p>
      <p className={`tabular mt-1 font-display text-xl font-bold ${c}`}>{value}</p>
    </div>
  );
}
