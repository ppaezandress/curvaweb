"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data-context";
import { buildAgenda, type AgendaEvent } from "@/lib/agenda";
import { AgendaBoard, useNow, type AgendaStatus } from "@/components/agenda/AgendaBoard";

type Payload = { connected: boolean; events: AgendaEvent[] };

// "Agenda": el calendario de la persona viviendo en la app. Cada quien ve SU agenda (la
// petición usa su propia sesión de Google, gc_refresh). Esta página solo trae los datos; todo
// el diseño vive en <AgendaBoard/> (así se puede previsualizar con datos de ejemplo).
export default function AgendaPage() {
  const { members } = useData();
  const memberByEmail = useMemo(
    () => Object.fromEntries(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m])),
    [members],
  );

  const [data, setData] = useState<Payload | null>(null);
  const now = useNow(30_000);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/gcal/week")
        .then((r) => r.json())
        .then((d: Payload) => { if (alive) setData(d); })
        .catch(() => { if (alive) setData({ connected: false, events: [] }); });
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const status: AgendaStatus = data === null ? "loading" : !data.connected ? "disconnected" : "ready";
  const view = useMemo(() => (data?.connected ? buildAgenda(data.events, now) : null), [data, now]);

  return <AgendaBoard status={status} view={view} memberByEmail={memberByEmail} now={now} />;
}
