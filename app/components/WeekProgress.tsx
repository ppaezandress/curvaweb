"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { formatHours } from "@/lib/format";

type Rec = { person: string; start: string; minutes: number };
const DAY_MS = 86400000;
const DOW = ["L", "M", "M", "J", "V", "S", "D"];

function mondayOf(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Mini-gráfica: horas por día de ESTA semana (solo del usuario actual).
export function WeekProgress() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const [records, setRecords] = useState<Rec[]>([]);

  useEffect(() => {
    fetch("/api/time-entries").then((r) => r.json()).then((d) => setRecords(d.records || [])).catch(() => {});
  }, []);

  const { perDay, total, todayIdx } = useMemo(() => {
    const start = mondayOf(new Date()).getTime();
    const per = [0, 0, 0, 0, 0, 0, 0];
    records.forEach((r) => {
      if (me && r.person !== me.name) return;
      const t = r.start ? new Date(r.start).getTime() : 0;
      const i = Math.floor((t - start) / DAY_MS);
      if (i >= 0 && i < 7) per[i] += r.minutes;
    });
    const ti = Math.floor((Date.now() - start) / DAY_MS);
    return { perDay: per, total: per.reduce((a, b) => a + b, 0), todayIdx: ti };
  }, [records, me]);

  const max = Math.max(...perDay, 1);

  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-wide text-zinc-400">Esta semana</p>
        <p className="tabular font-display text-xl font-bold text-ink">{formatHours(total * 60)}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2" style={{ height: 56 }}>
        {perDay.map((m, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center" style={{ height: 40 }}>
              <div
                className={`w-full max-w-[22px] rounded-md transition-all ${i === todayIdx ? "bg-curva-purple" : "bg-zinc-200"}`}
                style={{ height: `${Math.max(m > 0 ? 8 : 2, (m / max) * 40)}px` }}
                title={formatHours(m * 60)}
              />
            </div>
            <span className={`text-[10px] ${i === todayIdx ? "font-bold text-curva-purple" : "text-zinc-400"}`}>{DOW[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
