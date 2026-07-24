"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Video, ChevronRight } from "lucide-react";

type Ev = { id: string; title: string; start: number; end: number; attendees: string[]; hangoutLink?: string };

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }).replace(".", "");

// "Juntas de hoy": el calendario del usuario vive en la app (Balmori #10 — "no me tenga
// que ir a Calendar, y que me pueda unir desde aquí"). Lee /api/gcal/day (eventos de hoy) y
// resalta la que está en curso. Si no hay Google Calendar conectado, no renderiza nada.
export function TodayMeetings() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  // "now" se captura en el callback de fetch (no en render): leer Date.now() durante el
  // render es impuro (react-hooks/purity). Se refresca en cada carga; para una lista de
  // juntas basta esa resolución (los badges "en curso"/"pronto" no necesitan el segundo).
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/gcal/day")
        .then((r) => r.json())
        .then((d) => { if (alive && d.connected) { setNow(Date.now()); setEvents((d.events as Ev[]) || []); } })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60_000); // refresca cada 5 min
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!events || events.length === 0) return null;

  const upcoming = [...events].sort((a, b) => a.start - b.start).filter((e) => e.end > now - 15 * 60_000);
  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock size={15} className="text-accent" />
        <h3 className="text-sm font-bold text-fg">Juntas de hoy</h3>
        <span className="rounded-full bg-surface-2 px-1.5 text-caption font-semibold text-muted">{upcoming.length}</span>
        <Link href="/agenda" className="ml-auto text-caption font-semibold text-accent transition hover:opacity-80 focus-ring">
          Mi semana →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {upcoming.slice(0, 5).map((e) => {
          const live = now >= e.start && now <= e.end;
          const soon = !live && e.start > now && e.start - now <= 15 * 60_000;
          return (
            <li key={e.id} className={`flex items-center gap-2.5 rounded-control border px-3 py-2 ${live ? "border-accent/40 bg-accent/[0.06]" : "border-line"}`}>
              <span className="tabular shrink-0 text-caption font-semibold text-muted">{hhmm(e.start)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-fg">{e.title}</p>
                {(live || soon) && (
                  <p className={`text-caption font-semibold ${live ? "text-accent" : "text-warn"}`}>
                    {live ? "En curso ahora" : "Empieza pronto"}
                  </p>
                )}
              </div>
              {e.hangoutLink ? (
                <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-caption font-semibold text-white transition hover:opacity-90 focus-ring">
                  <Video size={12} /> Unirse
                </a>
              ) : (
                <ChevronRight size={14} className="shrink-0 text-muted/60" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
