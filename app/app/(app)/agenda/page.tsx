"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { CalendarClock, Video, Users, Link2, Coffee, ArrowRight, Sparkles } from "lucide-react";
import { useData } from "@/lib/data-context";
import { Avatar } from "@/components/Avatar";
import type { Member } from "@/lib/mock-data";
import {
  buildAgenda, untilLabel, progressOf, minutesLabel,
  type AgendaEvent, type AgendaView,
} from "@/lib/agenda";

type Payload = { connected: boolean; events: AgendaEvent[] };

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" }).replace(".", "").toLowerCase();

// Reveal con blur (canon de diseño #7): opacity + translateY + scale + blur, ease-pitch.
const reveal: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.985, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.6, 0, 0.05, 1] } },
};
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };

// ── Relojes vivos, aislados ────────────────────────────────────────────────
// Cada elemento que "vive" tiene su propio reloj → el tick re-renderiza SOLO ese trozo, nunca
// la página (AGENTS.md regla #2). Init perezoso (patrón de useLiveElapsed): sin setState
// síncrono en efecto ni Date.now() en render.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Cuenta atrás de la próxima junta ("en 25 min"), tick de 1 s.
function Countdown({ target }: { target: number }) {
  const now = useNow(1000);
  return <span className="tabular">{untilLabel(target, now)}</span>;
}

// Minutos restantes de la junta en curso, en grande. Tick de 1 s.
function Remaining({ end }: { end: number }) {
  const now = useNow(1000);
  const min = Math.max(0, Math.round((end - now) / 60_000));
  return <span className="tabular">{min}</span>;
}

// Barra de progreso viva de la junta en curso. Tick de 15 s (suave).
function LiveBar({ start, end }: { start: number; end: number }) {
  const now = useNow(15_000);
  const p = Math.round(progressOf({ id: "", title: "", attendees: [], start, end }, now) * 100);
  return (
    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-accent/15">
      <motion.div
        className="h-full rounded-full bg-accent"
        initial={{ width: 0 }}
        animate={{ width: `${p}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// Número que cuenta hacia su valor al aparecer ("datos vivos", canon #4).
function CountUp({ value, className }: { value: number; className?: string }) {
  const [n, setN] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    let raf = 0; const from = ref.current; const delta = value - from; const dur = 650; let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + delta * eased));
      if (p < 1) raf = requestAnimationFrame(tick); else ref.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{n}</span>;
}

// Pila de avatares de asistentes (correo → miembro del equipo si hay match).
function Attendees({ emails, memberByEmail }: { emails: string[]; memberByEmail: Record<string, Member> }) {
  if (!emails.length) return null;
  const shown = emails.slice(0, 4);
  const extra = emails.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {shown.map((email) => {
          const m = memberByEmail[email.toLowerCase()];
          return (
            <span key={email} className="inline-block rounded-full ring-2 ring-[var(--surface-solid)]" title={m?.name || email}>
              <Avatar member={m} name={m ? undefined : email.split("@")[0]} size={24} />
            </span>
          );
        })}
      </div>
      {extra > 0 && <span className="ml-2 text-caption font-semibold text-muted">+{extra}</span>}
    </div>
  );
}

function JoinButton({ href, big }: { href: string; big?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`glow-accent inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent font-semibold text-white transition active:scale-[0.97] focus-ring ${
        big ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
      }`}
    >
      <Video size={big ? 15 : 13} /> Unirse
    </a>
  );
}

// ── Hero "cockpit": la junta que importa ahora ──────────────────────────────
function Spotlight({ view, memberByEmail }: { view: AgendaView; memberByEmail: Record<string, Member> }) {
  const live = view.live;
  const ev = live ?? view.next;
  if (!ev) return null;
  return (
    <motion.div
      variants={reveal}
      className="glass glow-accent relative overflow-hidden rounded-hero p-5 sm:p-6"
    >
      {/* Tinte de acento + orbe: profundidad sobre la nebulosa (no un bloque plano) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/[0.12] via-transparent to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/20 blur-3xl" aria-hidden />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-caption font-bold uppercase tracking-wider text-accent">
            {live ? (
              <><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span> En curso</>
            ) : (
              <><CalendarClock size={12} /> A continuación</>
            )}
          </div>
          <p className="font-display text-xl font-bold leading-tight tracking-tight text-fg sm:text-2xl">{ev.title}</p>
          <p className="tabular mt-1 text-sm font-medium text-muted">{hhmm(ev.start)} – {hhmm(ev.end)}</p>
          {live && <LiveBar start={ev.start} end={ev.end} />}
        </div>

        {/* Lectura viva grande, tipo cockpit */}
        <div className="flex shrink-0 items-end justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:text-right">
          <div>
            {live ? (
              <p className="font-display text-3xl font-bold leading-none tracking-tight text-accent sm:text-4xl">
                <Remaining end={ev.end} /><span className="ml-1 text-base font-semibold text-muted">min</span>
              </p>
            ) : (
              <p className="font-display text-xl font-bold leading-none tracking-tight text-accent sm:text-2xl">
                <Countdown target={ev.start} />
              </p>
            )}
            <p className="mt-1 text-caption font-medium text-muted">{live ? "restantes" : "para empezar"}</p>
          </div>
          {ev.hangoutLink ? <JoinButton href={ev.hangoutLink} big /> : <span className="text-caption font-medium text-muted">Sin videollamada</span>}
        </div>
      </div>

      {ev.attendees.length > 0 && (
        <div className="relative mt-4 flex items-center gap-2 border-t border-line/70 pt-3">
          <Attendees emails={ev.attendees} memberByEmail={memberByEmail} />
        </div>
      )}
    </motion.div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
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

  const view = useMemo(() => (data?.connected ? buildAgenda(data.events, now) : null), [data, now]);

  return (
    <div className="mx-auto max-w-2xl">
      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
        <motion.header variants={reveal} className="space-y-1">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">Agenda</h1>
          <p className="text-sm text-muted">Tus juntas de hoy y los próximos días, directo de tu calendario.</p>
        </motion.header>

        {data === null ? (
          <div className="space-y-3">
            <div className="h-32 animate-pulse rounded-hero bg-surface-2/60" />
            {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface-2/40" />)}
          </div>
        ) : !data.connected ? (
          <motion.div variants={reveal} className="glass rounded-hero p-8 text-center sm:p-10">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent/12 text-accent"><Link2 size={22} /></div>
            <p className="font-display text-lg font-bold text-fg">Conecta tu Google Calendar</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              Para que tu agenda viva aquí. Cada quien ve solo su propio calendario; nadie más ve tus juntas.
            </p>
            <Link
              href="/ajustes"
              className="glow-accent mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] focus-ring"
            >
              Ir a Integraciones <ArrowRight size={15} />
            </Link>
          </motion.div>
        ) : view!.total === 0 ? (
          <motion.div variants={reveal} className="glass rounded-hero p-10 text-center sm:p-12">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted"><Coffee size={22} /></div>
            <p className="font-display text-lg font-bold text-fg">Semana despejada</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">Nada en tu calendario de aquí a 7 días. Todo tuyo para trabajo enfocado.</p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-caption font-medium text-accent"><Sparkles size={13} /> Aprovéchala</div>
          </motion.div>
        ) : (
          <>
            <Spotlight view={view!} memberByEmail={memberByEmail} />

            <div className="space-y-7">
              {view!.days.map((d) => (
                <motion.section key={d.key} variants={reveal} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className={`font-display text-base font-bold tracking-tight ${d.isToday ? "text-fg" : "text-muted"}`}>{d.label}</h2>
                    <span className="tabular text-caption font-medium text-muted">
                      <CountUp value={d.count} /> {d.count === 1 ? "junta" : "juntas"} · {minutesLabel(d.busyMin)}
                    </span>
                  </div>

                  {/* Timeline con espina */}
                  <div className="relative pl-5">
                    <span className="absolute bottom-3 left-[5px] top-3 w-px bg-line" aria-hidden />
                    <ul className="space-y-2">
                      {d.meetings.map((m, i) => {
                        const live = view!.live?.id === m.id;
                        const soon = !live && m.start > now && m.start - now <= 15 * 60_000;
                        // Marcador "ahora": antes de la primera junta de HOY que aún no empieza.
                        const showNow = d.isToday && m.start > now &&
                          !d.meetings.slice(0, i).some((p) => p.start > now);
                        return (
                          <li key={m.id} className="relative">
                            {m.gapBeforeMin >= 30 && (
                              <p className="-ml-5 mb-2 pl-8 text-caption font-medium text-muted/60">{minutesLabel(m.gapBeforeMin)} libres</p>
                            )}
                            {showNow && (
                              <div className="-ml-5 mb-2 flex items-center gap-2 pl-[1px]">
                                <span className="h-2 w-2 rounded-full bg-warn ring-4 ring-warn/15" aria-hidden />
                                <span className="text-caption font-bold uppercase tracking-wider text-warn">Ahora</span>
                                <span className="h-px flex-1 bg-warn/25" aria-hidden />
                              </div>
                            )}
                            {/* Nodo en la espina */}
                            <span
                              className={`absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--background)] ${live ? "bg-accent" : "bg-line"}`}
                              aria-hidden
                            />
                            <div
                              className={`group flex items-center gap-3 rounded-card border px-3.5 py-3 transition ${
                                live ? "border-accent/40 bg-accent/[0.06]" : "border-line bg-surface hover:border-accent/30 hover:bg-surface-2/40"
                              }`}
                            >
                              <div className="w-12 shrink-0">
                                <p className="tabular text-sm font-bold text-fg">{hhmm(m.start)}</p>
                                <p className="tabular text-caption text-muted">{minutesLabel(Math.round((m.end - m.start) / 60_000))}</p>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-fg">{m.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-caption">
                                  {live ? <span className="font-semibold text-accent">En curso</span>
                                    : soon ? <span className="font-semibold text-warn">Empieza pronto</span>
                                    : <span className="text-muted">Termina {hhmm(m.end)}</span>}
                                  {m.attendees.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-muted sm:hidden"><Users size={11} /> {m.attendees.length}</span>
                                  )}
                                </div>
                              </div>
                              <div className="hidden sm:block"><Attendees emails={m.attendees} memberByEmail={memberByEmail} /></div>
                              {m.hangoutLink && <JoinButton href={m.hangoutLink} />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </motion.section>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
