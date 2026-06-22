"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  User,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { mondayOf } from "@/lib/date";
import { SectionHeader } from "@/components/ui/SectionHeader";

type Record = {
  id: string;
  taskId: string;
  person: string;
  start: string;
  minutes: number;
};

const DAY_MS = 86400000;

function fmtH(mins: number) {
  if (!mins) return "·";
  const h = mins / 60;
  return `${h.toFixed(1).replace(".0", "")}h`;
}
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function TimesheetPage() {
  const { currentUserId } = useApp();
  const { tasks, taskById, projectById, clientById, memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [records, setRecords] = useState<Record[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [scope, setScope] = useState<"me" | "team">("me");

  useEffect(() => {
    fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS)),
    [weekStart],
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

  // Registros de la semana, en alcance.
  const weekRecords = useMemo(() => {
    return records.filter((r) => {
      if (!r.start) return false;
      const t = new Date(r.start).getTime();
      if (t < weekStart.getTime() || t >= weekEnd.getTime()) return false;
      if (scope === "me" && me) return r.person === me.name;
      return true;
    });
  }, [records, weekStart, weekEnd, scope, me]);

  // Filas = tareas con tiempo esta semana. Celdas = minutos por día.
  const rows = useMemo(() => {
    const byTask = new Map<string, number[]>();
    weekRecords.forEach((r) => {
      const dayIdx = Math.floor((new Date(r.start).getTime() - weekStart.getTime()) / DAY_MS);
      if (dayIdx < 0 || dayIdx > 6) return;
      if (!byTask.has(r.taskId)) byTask.set(r.taskId, [0, 0, 0, 0, 0, 0, 0]);
      byTask.get(r.taskId)![dayIdx] += r.minutes;
    });
    return [...byTask.entries()]
      .map(([taskId, cells]) => {
        const task = taskById[taskId];
        const project = task ? projectById[task.projectId] : undefined;
        const client = project ? clientById[project.clientId] : undefined;
        return {
          taskId,
          name: task?.name || "(tarea externa)",
          client: client?.name,
          cells,
          total: cells.reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [weekRecords, weekStart, taskById, projectById, clientById]);

  const dayTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    rows.forEach((r) => r.cells.forEach((c, i) => (t[i] += c)));
    return t;
  }, [rows]);
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  const todayIdx = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const idx = Math.floor((t.getTime() - weekStart.getTime()) / DAY_MS);
    return idx >= 0 && idx <= 6 ? idx : -1;
  }, [weekStart]);

  const label = `${weekStart.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – ${new Date(weekEnd.getTime() - DAY_MS).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}`;

  return (
    <div>
      <SectionHeader
        title="Semana"
        subtitle="Tu semana en horas, por tarea y día."
        action={
          <div className="inline-flex rounded-full border border-line bg-white p-0.5 text-sm shadow-soft">
            <button onClick={() => setScope("me")} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition focus-ring ${scope === "me" ? "bg-ink text-white" : "text-zinc-500"}`}>
              <User size={15} /> Yo
            </button>
            <button onClick={() => setScope("team")} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition focus-ring ${scope === "team" ? "bg-ink text-white" : "text-zinc-500"}`}>
              <Users size={15} /> Equipo
            </button>
          </div>
        }
      />

      {/* Navegación de semana */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 shadow-soft">
        <button onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100">
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays size={16} className="text-zinc-400" />
          {label}
          <button onClick={() => setWeekStart(mondayOf(new Date()))} className="ml-2 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">
            Esta semana
          </button>
        </div>
        <button onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-white py-16 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" /> Cargando registros…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-soft">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-semibold text-zinc-500">Tarea</th>
                {days.map((d, i) => (
                  <th key={i} className={`px-2 py-3 text-center font-semibold ${i === todayIdx ? "text-curva-purple" : "text-zinc-500"}`}>
                    <div>{DOW[i]}</div>
                    <div className="text-xs font-normal text-zinc-400">{d.getDate()}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-semibold text-ink">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.taskId} className="border-b border-line/60 last:border-0 hover:bg-zinc-50/60">
                  <td className="sticky left-0 z-10 max-w-[280px] bg-white px-4 py-3">
                    <div className="truncate font-medium text-ink">{r.name}</div>
                    {r.client && <div className="truncate text-xs text-zinc-400">{r.client}</div>}
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`px-2 py-3 text-center tabular ${c ? "font-semibold text-ink" : "text-zinc-300"} ${i === todayIdx ? "bg-curva-purple/5" : ""}`}>
                      {fmtH(c)}
                    </td>
                  ))}
                  <td className="tabular px-4 py-3 text-right font-bold text-ink">{fmtH(r.total)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-zinc-400">
                    No hay registros esta semana. Dale play a una tarea para empezar.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-zinc-50/60">
                  <td className="sticky left-0 z-10 bg-zinc-50 px-4 py-3 font-bold text-ink">Total del día</td>
                  {dayTotals.map((c, i) => (
                    <td key={i} className={`tabular px-2 py-3 text-center font-semibold ${i === todayIdx ? "text-curva-purple" : "text-zinc-600"}`}>{fmtH(c)}</td>
                  ))}
                  <td className="tabular px-4 py-3 text-right font-display text-base font-bold text-ink">{fmtH(weekTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
