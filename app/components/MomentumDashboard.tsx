"use client";

import { useEffect, useMemo, useState } from "react";
import { Flame, TrendingUp, TrendingDown } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { mondayOf, DIAS_CORTOS } from "@/lib/date";
import { dayKey, computeStreak } from "@/lib/culture";
import { formatDuration } from "@/lib/format";

const DAY = 86_400_000;
type Rec = { person?: string; start?: string; minutes?: number };

// Dashboard estilo WHOOP: un anillo de "momentum" (tu día vs tu día típico), la semana
// interactiva (pica un día para verlo en el anillo) y tu tendencia vs la semana pasada.
export function MomentumDashboard() {
  const { currentUserId, loggedSecondsToday } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Rec[]>([]);
  const [sel, setSel] = useState<number | null>(null); // día seleccionado (índice 0-6); null = hoy

  useEffect(() => {
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
  }, []);

  const data = useMemo(() => {
    const mine = me?.name ? records.filter((r) => (r.person || "").trim() === me.name) : [];
    const weekStart = mondayOf(new Date()).getTime();
    const todayIdx = Math.min(6, Math.max(0, Math.floor((Date.now() - weekStart) / DAY)));

    const perDay = [0, 0, 0, 0, 0, 0, 0];
    let lastWeek = 0;
    const activeDays = new Set<string>();
    let activeSum = 0;
    mine.forEach((r) => {
      const t = r.start ? new Date(r.start).getTime() : 0;
      const min = r.minutes || 0;
      if (!t || min <= 0) return;
      const i = Math.floor((t - weekStart) / DAY);
      if (i >= 0 && i < 7) perDay[i] += min;
      else if (i < 0 && i >= -7) lastWeek += min;
      // promedio de día activo (últimos 28 días) para el "objetivo" del anillo
      if (t >= Date.now() - 28 * DAY) { activeDays.add(dayKey(t)); }
    });
    mine.forEach((r) => {
      const t = r.start ? new Date(r.start).getTime() : 0;
      if (t >= Date.now() - 28 * DAY) activeSum += r.minutes || 0;
    });
    // hoy en vivo: usa el cronómetro si supera lo ya registrado
    const liveToday = Math.round(loggedSecondsToday / 60);
    perDay[todayIdx] = Math.max(perDay[todayIdx], liveToday);

    const goal = Math.max(90, activeDays.size ? Math.round(activeSum / activeDays.size) : 0) || 120;
    const weekTotal = perDay.reduce((a, b) => a + b, 0);

    // racha
    const days = new Set<string>();
    mine.forEach((r) => { const t = r.start ? new Date(r.start).getTime() : 0; if (t) days.add(dayKey(t)); });
    if (liveToday > 0) days.add(dayKey(Date.now()));

    return { perDay, todayIdx, goal, weekTotal, lastWeek, streak: computeStreak(days) };
  }, [records, me?.name, loggedSecondsToday]);

  const idx = sel ?? data.todayIdx;
  const dayMin = data.perDay[idx] || 0;
  const pct = Math.min(1, data.goal ? dayMin / data.goal : 0);
  const weekDelta = data.lastWeek > 0 ? Math.round(((data.weekTotal - data.lastWeek) / data.lastWeek) * 100) : null;
  const max = Math.max(...data.perDay, 1);

  // Anillo SVG
  const R = 58, C = 2 * Math.PI * R;

  return (
    <section className="grid gap-4 rounded-hero border border-line bg-surface p-5 shadow-soft sm:grid-cols-[auto_1fr]">
      {/* Anillo de momentum */}
      <div className="flex items-center justify-center">
        <div className="relative h-[150px] w-[150px]">
          <svg width="150" height="150" className="-rotate-90">
            <defs>
              <linearGradient id="momentumGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="color-mix(in srgb, var(--accent) 55%, white)" />
                <stop offset="1" stopColor="var(--accent)" />
              </linearGradient>
            </defs>
            <circle cx="75" cy="75" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
            <circle
              cx="75" cy="75" r={R} fill="none" stroke="url(#momentumGrad)" strokeWidth="12" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
              style={{ transition: "stroke-dashoffset 0.6s var(--ease-curva)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="tabular font-display text-2xl font-bold text-fg">{formatDuration(dayMin * 60)}</p>
            <p className="text-caption text-muted">{sel === null || idx === data.todayIdx ? "hoy" : DIAS_CORTOS[idx]} · {Math.round(pct * 100)}%</p>
          </div>
        </div>
      </div>

      {/* Semana interactiva + tendencia */}
      <div className="flex flex-col justify-between gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-muted">Esta semana</p>
            <p className="tabular font-display text-lg font-bold text-fg">{formatDuration(data.weekTotal * 60)}</p>
          </div>
          <div className="flex items-center gap-2">
            {data.streak > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent">
                <Flame size={13} /> {data.streak}
              </span>
            )}
            {weekDelta !== null && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${weekDelta >= 0 ? "bg-success/15 text-success" : "bg-danger/10 text-danger"}`}>
                {weekDelta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {Math.abs(weekDelta)}%
              </span>
            )}
          </div>
        </div>
        {/* Barras por día — pica una para verla en el anillo */}
        <div className="flex items-end justify-between gap-1.5" style={{ height: 80 }}>
          {data.perDay.map((m, i) => {
            const h = Math.round((m / max) * 64);
            const on = i === idx;
            const isToday = i === data.todayIdx;
            return (
              <button key={i} onClick={() => setSel(i === data.todayIdx ? null : i)} className="group flex flex-1 flex-col items-center justify-end gap-1 focus-ring rounded-lg" title={`${DIAS_CORTOS[i]}: ${formatDuration(m * 60)}`}>
                <div
                  className={`w-full rounded-md transition-colors ${on ? "bg-accent" : isToday ? "bg-accent/40" : "bg-surface-2 group-hover:bg-accent/20"}`}
                  style={{ height: Math.max(h, m > 0 ? 4 : 2) }}
                />
                <span className={`text-caption font-semibold ${on ? "text-accent" : "text-muted"}`}>{DIAS_CORTOS[i]}</span>
              </button>
            );
          })}
        </div>
        <p className="text-caption text-muted">El anillo compara tu día con tu día típico (~{formatDuration(data.goal * 60)}). Pica un día para verlo.</p>
      </div>
    </section>
  );
}
