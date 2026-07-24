"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarClock, Video, Users, Link2, Radio, Coffee, ArrowRight } from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useData } from "@/lib/data-context";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/mock-data";
import {
  buildAgenda, untilLabel, progressOf, minutesLabel,
  type AgendaEvent, type AgendaView,
} from "@/lib/agenda";

type Payload = { connected: boolean; events: AgendaEvent[] };

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }).replace(".", "");

// Reloj aislado: cada componente que "vive" (cuenta regresiva, barra de progreso) tiene el
// suyo, así el tick re-renderiza SOLO ese trozo y nunca la página entera (AGENTS.md regla #2).
// Init perezoso (mismo patrón que useLiveElapsed): evita setState síncrono en efecto y leer
// Date.now() en el cuerpo del render. Sin mismatch de hidratación: en el primer render `data`
// es null → se pinta el skeleton, `now` no llega al HTML.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Cuenta regresiva viva ("en 25 min"), tick de 1 s, aislada.
function LiveCountdown({ target }: { target: number }) {
  const now = useNow(1000);
  return <span className="tabular">{untilLabel(target, now)}</span>;
}

// Barra de progreso de la junta en curso + minutos restantes. Tick de 15 s (suave, no necesita
// el segundo).
function LiveProgress({ start, end }: { start: number; end: number }) {
  const now = useNow(15_000);
  const p = progressOf({ id: "", title: "", attendees: [], start, end }, now);
  const leftMin = Math.max(0, Math.round((end - now) / 60_000));
  return (
    <div className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
        <motion.div
          className="h-full rounded-full bg-white"
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(p * 100)}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <p className="mt-1.5 text-caption font-medium text-white/85">
        {leftMin > 0 ? `Termina en ${minutesLabel(leftMin)}` : "Terminando"}
      </p>
    </div>
  );
}

// Pila de avatares de asistentes (correos → miembros del equipo cuando hay match).
function Attendees({ emails, memberByEmail, dark }: { emails: string[]; memberByEmail: Record<string, Member>; dark?: boolean }) {
  if (!emails.length) return null;
  const shown = emails.slice(0, 4);
  const extra = emails.length - shown.length;
  const ring = dark ? "ring-white/70" : "ring-[var(--surface-solid)]";
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((email) => {
          const m = memberByEmail[email.toLowerCase()];
          return (
            <span key={email} className={`inline-block rounded-full ring-2 ${ring}`} title={m?.name || email}>
              <Avatar member={m} name={m ? undefined : email.split("@")[0]} size={22} />
            </span>
          );
        })}
      </div>
      {extra > 0 && (
        <span className={`ml-1.5 text-caption font-semibold ${dark ? "text-white/80" : "text-muted"}`}>+{extra}</span>
      )}
    </div>
  );
}

const JoinButton = ({ href, dark }: { href: string; dark?: boolean }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] focus-ring ${
      dark ? "bg-white text-accent hover:bg-white/90" : "bg-accent text-white hover:opacity-90"
    }`}
  >
    <Video size={13} /> Unirse
  </a>
);

// Hero: la junta que importa AHORA. En curso (con barra viva) o la próxima (con cuenta
// regresiva). Es lo primero que ves — "¿a qué le entro y cuándo?".
function Spotlight({ view, memberByEmail }: { view: AgendaView; memberByEmail: Record<string, Member> }) {
  const live = view.live;
  const ev = live ?? view.next;
  if (!ev) return null;
  return (
    <motion.div
      variants={fadeUp}
      className="relative overflow-hidden rounded-hero bg-accent p-5 text-white shadow-float"
    >
      {/* Orbe sutil de profundidad */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative">
        <div className="mb-2 flex items-center gap-1.5 text-caption font-bold uppercase tracking-wide text-white/90">
          {live ? (
            <><Radio size={13} className="animate-pulse" /> En curso</>
          ) : (
            <><CalendarClock size={13} /> A continuación · <LiveCountdown target={ev.start} /></>
          )}
        </div>
        <p className="text-lg font-bold leading-snug">{ev.title}</p>
        <p className="mt-0.5 text-sm font-medium text-white/85">
          {hhmm(ev.start)}–{hhmm(ev.end)}
        </p>

        {live && <LiveProgress start={ev.start} end={ev.end} />}

        <div className="mt-4 flex items-center justify-between gap-3">
          <Attendees emails={ev.attendees} memberByEmail={memberByEmail} dark />
          {ev.hangoutLink ? (
            <JoinButton href={ev.hangoutLink} dark />
          ) : (
            <span className="text-caption font-medium text-white/70">Sin videollamada</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// "Mi semana": el calendario de la persona viviendo en la app. Cada quien ve SU agenda (la
// petición usa su propia sesión de Google). Hero con lo de ahora + la semana por día.
export default function AgendaPage() {
  const { members } = useData();
  const memberByEmail = useMemo(
    () => Object.fromEntries(members.filter((m) => m.email).map((m) => [m.email!.toLowerCase(), m])),
    [members],
  );

  const [data, setData] = useState<Payload | null>(null);
  const now = useNow(30_000); // granularidad para "en curso/próxima"; los ticks vivos van aparte

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

  const view = useMemo(
    () => (data?.connected && now ? buildAgenda(data.events, now) : null),
    [data, now],
  );

  return (
    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="mx-auto max-w-2xl space-y-6">
      <motion.header variants={fadeUp} className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarClock size={18} className="text-accent" />
          <h1 className="font-display text-xl font-bold leading-tight text-fg sm:text-2xl">Agenda</h1>
        </div>
        <p className="text-sm text-muted">Tus juntas de hoy y los próximos días, directo de tu calendario.</p>
      </motion.header>

      {data === null || (data.connected && !view) ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-hero bg-surface-2/60" />
          {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-card border border-line bg-surface-2/40" />)}
        </div>
      ) : !data.connected ? (
        <motion.div variants={fadeUp} className="rounded-hero border border-line bg-surface p-8 text-center shadow-soft">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-accent/10">
            <Link2 size={20} className="text-accent" />
          </div>
          <p className="text-sm font-semibold text-fg">Conecta tu Google Calendar</p>
          <p className="mx-auto mt-1 max-w-sm text-caption text-muted">
            Para que tu agenda viva aquí. Cada quien ve solo su propio calendario; nadie más ve tus juntas.
          </p>
          <Link
            href="/ajustes"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white transition active:scale-[0.97] hover:opacity-90 focus-ring"
          >
            Ir a Integraciones <ArrowRight size={14} />
          </Link>
        </motion.div>
      ) : view!.total === 0 ? (
        <motion.div variants={fadeUp} className="rounded-hero border border-line bg-surface p-10 text-center shadow-soft">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2">
            <Coffee size={20} className="text-muted" />
          </div>
          <p className="text-sm font-semibold text-fg">Semana despejada</p>
          <p className="mt-1 text-caption text-muted">Nada en tu calendario de aquí a 7 días. Tiempo para trabajo enfocado.</p>
        </motion.div>
      ) : (
        <>
          <Spotlight view={view!} memberByEmail={memberByEmail} />

          <div className="space-y-6">
            {view!.days.map((d) => (
              <motion.section key={d.key} variants={fadeUp} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className={`text-sm font-bold ${d.isToday ? "text-fg" : "text-muted"}`}>{d.label}</h2>
                  <span className="text-caption text-muted">
                    {d.count} {d.count === 1 ? "junta" : "juntas"} · {minutesLabel(d.busyMin)}
                  </span>
                </div>
                <ul className="space-y-1">
                  {d.meetings.map((m) => {
                    const live = view!.live?.id === m.id;
                    const soon = !live && m.start > now && m.start - now <= 15 * 60_000;
                    return (
                      <li key={m.id}>
                        {/* Hueco libre antes de esta junta (≥30 min) — así la agenda "respira" */}
                        {m.gapBeforeMin >= 30 && (
                          <p className="py-1 pl-3 text-caption text-muted/70">{minutesLabel(m.gapBeforeMin)} libres</p>
                        )}
                        <div
                          className={`flex items-center gap-3 rounded-control border px-3 py-2.5 transition ${
                            live ? "border-accent/50 bg-accent/[0.07]" : "border-line bg-surface hover:border-line/80"
                          }`}
                        >
                          <div className="w-11 shrink-0 text-right">
                            <p className="tabular text-xs font-semibold text-fg">{hhmm(m.start)}</p>
                            <p className="tabular text-caption text-muted">{hhmm(m.end)}</p>
                          </div>
                          {/* Barra vertical proporcional a la duración */}
                          <span
                            className={`w-1 shrink-0 rounded-full ${live ? "bg-accent" : "bg-line"}`}
                            style={{ height: `${Math.max(20, Math.min(56, Math.round((m.end - m.start) / 60_000) * 0.7))}px` }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-fg">{m.title}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-caption">
                              {live ? (
                                <span className="font-semibold text-accent">En curso</span>
                              ) : soon ? (
                                <span className="font-semibold text-warn">Empieza pronto</span>
                              ) : (
                                <span className="text-muted">{minutesLabel(Math.round((m.end - m.start) / 60_000))}</span>
                              )}
                              {m.attendees.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-muted sm:hidden">
                                  <Users size={11} /> {m.attendees.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="hidden sm:block">
                            <Attendees emails={m.attendees} memberByEmail={memberByEmail} />
                          </div>
                          {m.hangoutLink && <JoinButton href={m.hangoutLink} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </motion.section>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
