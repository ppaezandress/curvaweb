"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatClock, formatHours } from "@/lib/format";

// Hace VISIBLE el conector de IA: reloj en vivo cuando Claude Code/Desktop trabaja,
// y el acumulado de hoy registrado como Modo IA.
export function AITodayCard() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [active, setActive] = useState<{ project: string; startedAt: number }[]>([]);
  const [todayMin, setTodayMin] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Sesiones de IA en curso (turno de Claude Code abierto)
  useEffect(() => {
    if (!me?.email) return;
    const tick = () => fetch(`/api/timing/live?u=${encodeURIComponent(me.email!)}`).then((r) => r.json()).then((d) => setActive(d.active || [])).catch(() => {});
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [me?.email]);

  // Acumulado de hoy en Modo IA
  useEffect(() => {
    if (!me?.name) return;
    const load = () => fetch("/api/time-entries").then((r) => r.json()).then((d) => {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0);
      const min = (d.records || [])
        .filter((r: { mode?: string; person?: string; start?: string; minutes?: number }) =>
          r.mode === "ai" && (r.person || "").trim() === me.name && r.start && new Date(r.start).getTime() >= t0.getTime())
        .reduce((a: number, r: { minutes?: number }) => a + (r.minutes || 0), 0);
      setTodayMin(min);
    }).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [me?.name]);

  const live = active.length > 0;
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  if (!me) return null;
  const elapsed = live ? Math.max(0, Math.round((now - Math.min(...active.map((a) => a.startedAt))) / 1000)) : 0;

  return (
    <section className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-curva-indigo/30 bg-white p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${live ? "ai-shimmer bg-curva-indigo text-white" : "bg-curva-indigo/10 text-curva-indigo"}`}>
          <Sparkles size={18} className={live ? "curva-live-dot" : ""} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-ink">{live ? "La IA está trabajando ✨" : "Tiempo con IA"}</p>
          <p className="truncate text-xs text-zinc-500">
            {live ? `${active[0].project}${active.length > 1 ? ` +${active.length - 1}` : ""}` : "Aparece solo cuando usas Claude Code"}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {live ? (
          <p className="tabular font-display text-2xl font-bold text-curva-indigo">{formatClock(elapsed)}</p>
        ) : (
          <p className="tabular font-display text-xl font-bold text-ink">{formatHours(todayMin * 60)}</p>
        )}
        <p className="text-[11px] text-zinc-400">{live ? "en vivo" : "hoy con IA"}</p>
      </div>
    </section>
  );
}
