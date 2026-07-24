"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarClock, Video, Users, CalendarX2, Link2 } from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";

type Ev = { id: string; title: string; start: number; end: number; attendees: string[]; hangoutLink?: string };
type Payload = { connected: boolean; events: Ev[] };

const DAY = 86_400_000;
const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }).replace(".", "");

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

// Etiqueta humana del día: "Hoy", "Mañana", o "mié 23 jul".
function dayLabel(ms: number, todayKey: string, tomorrowKey: string): string {
  const k = dayKey(ms);
  if (k === todayKey) return "Hoy";
  if (k === tomorrowKey) return "Mañana";
  return new Date(ms).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
}

// "Mi semana": el calendario de la persona, viviendo dentro de la app. Cada quien ve SU
// agenda (la petición usa su propia sesión de Google). Agrupa las juntas de hoy → +7 días
// por día, resalta la que está en curso, y deja unirte a la videollamada sin salir.
export default function AgendaPage() {
  const [data, setData] = useState<Payload | null>(null);
  // "now" se captura en el callback de fetch, no en render (react-hooks/purity: Date.now()
  // es impuro durante el render). Como la vista no aparece hasta que llega la data, nunca se
  // pinta con now=0.
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetch("/api/gcal/week")
        .then((r) => r.json())
        .then((d: Payload) => { if (alive) { setNow(Date.now()); setData(d); } })
        .catch(() => { if (alive) { setNow(Date.now()); setData({ connected: false, events: [] }); } });
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(now + DAY);

  // Se agrupan por día, en orden, filtrando las que ya terminaron hace rato.
  const upcoming = (data?.events ?? [])
    .filter((e) => e.end > now - 15 * 60_000)
    .sort((a, b) => a.start - b.start);
  const days: { key: string; label: string; events: Ev[] }[] = [];
  for (const e of upcoming) {
    const k = dayKey(e.start);
    let g = days.find((d) => d.key === k);
    if (!g) { g = { key: k, label: dayLabel(e.start, todayKey, tomorrowKey), events: [] }; days.push(g); }
    g.events.push(e);
  }

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="mx-auto max-w-2xl space-y-6">
      <motion.header variants={fadeUp} className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-accent" />
          <h1 className="font-display text-xl font-bold leading-tight text-fg sm:text-2xl">Mi semana</h1>
        </div>
        <p className="text-sm text-muted">Tus juntas de hoy y los próximos días, directo de tu calendario.</p>
      </motion.header>

      {data === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-card border border-line bg-surface-2/50" />
          ))}
        </div>
      ) : !data.connected ? (
        <motion.div variants={fadeUp} className="rounded-card border border-line bg-surface p-6 text-center shadow-soft">
          <Link2 size={22} className="mx-auto mb-3 text-muted" />
          <p className="text-sm font-medium text-fg">Conecta tu Google Calendar</p>
          <p className="mx-auto mt-1 max-w-sm text-caption text-muted">
            Para que tu agenda viva aquí. Cada quien ve solo su propio calendario; nadie más ve tus juntas.
          </p>
          <Link
            href="/ajustes"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 focus-ring"
          >
            Ir a Integraciones
          </Link>
        </motion.div>
      ) : days.length === 0 ? (
        <motion.div variants={fadeUp} className="rounded-card border border-line bg-surface p-8 text-center shadow-soft">
          <CalendarX2 size={22} className="mx-auto mb-3 text-muted" />
          <p className="text-sm font-medium text-fg">Sin juntas esta semana</p>
          <p className="mt-1 text-caption text-muted">Nada en tu calendario de aquí a 7 días. Tiempo para trabajo enfocado.</p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <motion.section key={d.key} variants={fadeUp} className="space-y-2">
              <h2 className="text-caption font-bold uppercase tracking-wide text-muted">{d.label}</h2>
              <ul className="space-y-1.5">
                {d.events.map((e) => {
                  const live = now >= e.start && now <= e.end;
                  const soon = !live && e.start > now && e.start - now <= 15 * 60_000;
                  return (
                    <li
                      key={e.id}
                      className={`flex items-center gap-3 rounded-control border px-3 py-2.5 ${
                        live ? "border-accent/40 bg-accent/[0.06]" : "border-line bg-surface"
                      }`}
                    >
                      <div className="shrink-0 text-right">
                        <p className="tabular text-xs font-semibold text-fg">{hhmm(e.start)}</p>
                        <p className="tabular text-caption text-muted">{hhmm(e.end)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{e.title}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-caption">
                          {live ? (
                            <span className="font-semibold text-accent">En curso ahora</span>
                          ) : soon ? (
                            <span className="font-semibold text-warn">Empieza pronto</span>
                          ) : null}
                          {e.attendees.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-muted">
                              <Users size={11} /> {e.attendees.length}
                            </span>
                          )}
                        </div>
                      </div>
                      {e.hangoutLink && (
                        <a
                          href={e.hangoutLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-caption font-semibold text-white transition hover:opacity-90 focus-ring"
                        >
                          <Video size={12} /> Unirse
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </motion.section>
          ))}
        </div>
      )}
    </motion.div>
  );
}
