"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { useAILive } from "@/lib/use-ai-live";
import { formatClock, formatHours } from "@/lib/format";

// Hace VISIBLE el conector de IA: reloj en vivo (push, instantáneo) cuando Claude Code/Desktop
// trabaja, y el acumulado de hoy registrado como Modo IA.
export function AITodayCard() {
  const { currentUserId, aiEnabled } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const live = useAILive();

  const [todayMin, setTodayMin] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Acumulado de hoy en Modo IA. Gateado por aiEnabled: con "Tiempo con IA" OFF (piloto) el
  // componente no se muestra (return null abajo), pero los hooks corren igual — sin este gate,
  // el interval de 30 s escaneaba el historial de tiempos aunque la feature esté apagada.
  useEffect(() => {
    if (!me?.name || !aiEnabled) return;
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
  }, [me?.name, aiEnabled]);

  // Reloj en vivo mientras la IA trabaja
  useEffect(() => {
    if (!live.live) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.live]);

  if (!me || !aiEnabled) return null;
  const elapsed = live.live && live.startedAt ? Math.max(0, Math.round((now - live.startedAt) / 1000)) : 0;

  return (
    <section className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-curva-indigo/30 bg-surface p-4 shadow-soft">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${live.live ? "ai-shimmer bg-curva-indigo text-white" : "bg-curva-indigo/10 text-curva-indigo"}`}>
          <Sparkles size={18} className={live.live ? "curva-live-dot" : ""} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-fg">{live.live ? "La IA está trabajando ✨" : "Tiempo con IA"}</p>
          <p className="truncate text-xs text-muted">
            {live.live ? (live.project || "Claude Code") : "Aparece solo cuando usas Claude Code"}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {live.live ? (
          <p className="tabular font-display text-2xl font-bold text-curva-indigo">{formatClock(elapsed)}</p>
        ) : (
          <p className="tabular font-display text-xl font-bold text-fg">{formatHours(todayMin * 60)}</p>
        )}
        <p className="text-[11px] text-muted">{live.live ? "en vivo" : "hoy con IA"}</p>
      </div>
    </section>
  );
}
