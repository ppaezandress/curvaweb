"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data-context";
import { buildAgenda, monthGridRange, shiftMonth, type AgendaEvent } from "@/lib/agenda";
import { AgendaBoard, useNow, type AgendaStatus, type AgendaMode } from "@/components/agenda/AgendaBoard";
import { EventModal } from "@/components/chat/EventModal";
import { toast } from "@/lib/toast";

type Payload = { connected: boolean; events: AgendaEvent[] };

const pad = (n: number) => String(n).padStart(2, "0");
const toYMD = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const firstOfThisMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

// "Agenda": el calendario de la persona viviendo en la app. Cada quien ve SU agenda (la
// petición usa su propia sesión de Google, gc_refresh). Dos vistas (Lista/Calendario) y crear
// juntas con invitados (reusa EventModal → /api/gcal/create). El diseño vive en <AgendaBoard/>.
export default function AgendaPage() {
  const { members } = useData();
  const memberByEmail = useMemo(
    () => Object.fromEntries(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m])),
    [members],
  );
  const people = useMemo(
    () => members.filter((m) => m.email).map((m) => ({ name: m.name, email: m.email! })),
    [members],
  );

  const now = useNow(30_000);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modo (persistido). Init perezoso lee localStorage (try/catch para SSR); el toggle no se
  // pinta hasta "ready", así que no hay mismatch de hidratación.
  const [mode, setMode] = useState<AgendaMode>(() => {
    try { return localStorage.getItem("agenda.mode") === "calendario" ? "calendario" : "lista"; }
    catch { return "lista"; }
  });
  const onMode = (m: AgendaMode) => { setMode(m); try { localStorage.setItem("agenda.mode", m); } catch {} };

  // Lista: la semana (hoy → +7 días).
  const [weekData, setWeekData] = useState<Payload | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/gcal/week").then((r) => r.json())
        .then((d: Payload) => { if (alive) setWeekData(d); })
        .catch(() => { if (alive) setWeekData({ connected: false, events: [] }); });
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [refreshKey]);

  // Calendario: el mes visible. Se pide perezosamente (solo en modo calendario) y al navegar.
  const [monthAnchor, setMonthAnchor] = useState<number>(firstOfThisMonth);
  const [selectedMs, setSelectedMs] = useState<number | null>(startOfToday);
  const [calData, setCalData] = useState<Payload | null>(null);
  useEffect(() => {
    if (mode !== "calendario") return;
    let alive = true;
    const { from, to } = monthGridRange(monthAnchor);
    fetch(`/api/gcal/range?from=${from}&to=${to}`).then((r) => r.json())
      .then((d: Payload) => { if (alive) setCalData(d); })
      .catch(() => { if (alive) setCalData({ connected: false, events: [] }); });
    return () => { alive = false; };
  }, [mode, monthAnchor, refreshKey]);

  // Crear junta: modal (reusa EventModal). Al agendar desde un día del calendario se prefija.
  const [newMeeting, setNewMeeting] = useState<{ open: boolean; date?: string }>({ open: false });
  const onNewMeeting = (dayMs?: number) => setNewMeeting({ open: true, date: dayMs ? toYMD(dayMs) : undefined });

  const active = mode === "lista" ? weekData : calData;
  const status: AgendaStatus = active === null ? "loading" : !active.connected ? "disconnected" : "ready";
  const view = useMemo(() => (weekData?.connected ? buildAgenda(weekData.events, now) : null), [weekData, now]);

  return (
    <>
      <AgendaBoard
        status={status} view={view} memberByEmail={memberByEmail} now={now}
        mode={mode} onMode={onMode}
        calEvents={calData?.events ?? []}
        monthAnchor={monthAnchor}
        selectedMs={selectedMs}
        onSelectDay={setSelectedMs}
        onPrevMonth={() => setMonthAnchor((a) => shiftMonth(a, -1))}
        onNextMonth={() => setMonthAnchor((a) => shiftMonth(a, 1))}
        onNewMeeting={onNewMeeting}
      />
      {newMeeting.open && (
        <EventModal
          open
          onClose={() => setNewMeeting({ open: false })}
          people={people}
          defaultDate={newMeeting.date}
          onInstant={(link) => window.open(link, "_blank", "noopener,noreferrer")}
          onCreated={(s) => {
            toast(`Junta creada: ${s.title} · ${s.whenLabel}`, { tone: "success" });
            setRefreshKey((k) => k + 1); // que la nueva junta aparezca sin recargar
          }}
        />
      )}
    </>
  );
}
