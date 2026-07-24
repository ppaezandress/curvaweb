"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "motion/react";
import { CalendarClock, Video, Users, Link2, Coffee, ArrowRight, Sparkles, List, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";
import type { Member } from "@/lib/mock-data";
import {
  untilLabel, progressOf, minutesLabel, dayLabel, buildMonthGrid, meetingsOn,
  type AgendaView, type AgendaEvent,
} from "@/lib/agenda";

export type AgendaMode = "lista" | "calendario";

const pad = (n: number) => String(n).padStart(2, "0");
// 24h compacto ("23:32", "09:00"): nunca se parte de línea y es consistente con /dia.
const hhmm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
// Duración compacta para la columna de la fila ("30m", "1h", "1h 30m").
const shortDur = (min: number) => min < 60 ? `${min}m` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`;

// Reveal con blur (canon de diseño #7): opacity + translateY + scale + blur, ease-pitch.
const reveal: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.985, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.6, 0, 0.05, 1] } },
};
const stagger: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };

// ── Relojes vivos, aislados ────────────────────────────────────────────────
// Cada elemento que "vive" tiene su propio reloj → el tick re-renderiza SOLO ese trozo, nunca
// toda la vista (AGENTS.md regla #2). Init perezoso (patrón de useLiveElapsed): sin setState
// síncrono en efecto ni Date.now() en render.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Countdown({ target }: { target: number }) {
  const now = useNow(1000);
  return <span className="tabular">{untilLabel(target, now)}</span>;
}

function Remaining({ end }: { end: number }) {
  const now = useNow(1000);
  const min = Math.max(0, Math.round((end - now) / 60_000));
  return <span className="tabular">{min}</span>;
}

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
    <motion.div variants={reveal} className="glass glow-accent relative overflow-hidden rounded-hero p-5 sm:p-6">
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
        </div>

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

      {live && <div className="relative"><LiveBar start={ev.start} end={ev.end} /></div>}

      {ev.attendees.length > 0 && (
        <div className="relative mt-4 flex items-center gap-2 border-t border-line/70 pt-3">
          <Attendees emails={ev.attendees} memberByEmail={memberByEmail} />
        </div>
      )}
    </motion.div>
  );
}

// Toggle Lista / Calendario (segmentado, mismo estilo que SegmentedNav pero por estado).
function ModeToggle({ mode, onMode }: { mode: AgendaMode; onMode: (m: AgendaMode) => void }) {
  const tabs: { id: AgendaMode; label: string; Icon: typeof List }[] = [
    { id: "lista", label: "Lista", Icon: List },
    { id: "calendario", label: "Calendario", Icon: CalendarDays },
  ];
  return (
    <div className="inline-flex gap-1 rounded-full border border-line bg-surface p-1 shadow-soft">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onMode(t.id)}
          aria-pressed={mode === t.id}
          className={cn(
            "focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition active:scale-[0.97]",
            mode === t.id ? "bg-ink text-white" : "text-muted hover:bg-surface-2",
          )}
        >
          <t.Icon size={15} /> {t.label}
        </button>
      ))}
    </div>
  );
}

// Fila compacta de junta para el panel del día seleccionado en el calendario.
function CalRow({ ev, memberByEmail }: { ev: AgendaEvent; memberByEmail: Record<string, Member> }) {
  return (
    <div className="flex items-center gap-3 rounded-control border border-line bg-surface px-3 py-2.5">
      <div className="w-10 shrink-0">
        <p className="tabular text-sm font-bold text-fg">{hhmm(ev.start)}</p>
        <p className="tabular text-caption text-muted">{shortDur(Math.round((ev.end - ev.start) / 60_000))}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{ev.title}</p>
        {ev.attendees.length > 0 && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-muted"><Users size={11} /> {ev.attendees.length}</p>
        )}
      </div>
      <div className="hidden sm:block"><Attendees emails={ev.attendees} memberByEmail={memberByEmail} /></div>
      {ev.hangoutLink && <JoinButton href={ev.hangoutLink} />}
    </div>
  );
}

// Chip de una junta dentro de una celda del calendario (estilo Google Calendar).
function EventChip({ ev, now, dim }: { ev: AgendaEvent; now: number; dim?: boolean }) {
  const live = now >= ev.start && now < ev.end;
  return (
    <span className={cn(
      "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight",
      live ? "bg-accent text-white" : dim ? "bg-surface-2 text-muted" : "bg-accent/12 text-accent",
    )}>
      <span className="tabular shrink-0 font-semibold">{hhmm(ev.start)}</span>
      <span className="truncate font-medium">{ev.title}</span>
    </span>
  );
}

// Vista de calendario estilo Google Calendar: rejilla del mes con las juntas DENTRO de cada
// día. En pantallas chicas (celdas muy angostas para texto) → puntos + panel del día abajo.
function CalendarMonth({
  events, anchor, selectedMs, now, memberByEmail, onSelect, onPrev, onNext, onToday, onNewMeeting,
}: {
  events: AgendaEvent[]; anchor: number; selectedMs: number | null; now: number;
  memberByEmail: Record<string, Member>;
  onSelect: (ms: number) => void; onPrev: () => void; onNext: () => void; onToday: () => void;
  onNewMeeting: (dayMs?: number) => void;
}) {
  const MAX = 3; // chips visibles por celda antes de "+N más"
  const grid = useMemo(() => buildMonthGrid(events, anchor, now), [events, anchor, now]);
  const selMeetings = useMemo(() => (selectedMs ? meetingsOn(events, selectedMs) : []), [events, selectedMs]);
  const selKey = selectedMs ? new Date(selectedMs).toDateString() : null;

  return (
    <motion.div variants={reveal} className="space-y-4">
      <div className="glass rounded-hero p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="font-display text-lg font-bold tracking-tight text-fg">{grid.label}</h2>
          <div className="flex items-center gap-1">
            <button onClick={onToday} className="focus-ring mr-1 rounded-full border border-line px-2.5 py-1 text-caption font-semibold text-muted transition hover:bg-surface-2 active:scale-95">Hoy</button>
            <button onClick={onPrev} aria-label="Mes anterior" className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-95"><ChevronLeft size={18} /></button>
            <button onClick={onNext} aria-label="Mes siguiente" className="focus-ring grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-surface-2 active:scale-95"><ChevronRight size={18} /></button>
          </div>
        </div>

        {/* Encabezados de día */}
        <div className="grid grid-cols-7">
          {grid.weekdays.map((w, i) => (
            <div key={i} className="pb-1.5 text-center text-caption font-bold uppercase tracking-wide text-muted/70">{w}</div>
          ))}
        </div>

        {/* Rejilla con bordes (cada día = un cuadro con sus juntas dentro) */}
        <div className="grid grid-cols-7 overflow-hidden rounded-tile border-l border-t border-line">
          {grid.weeks.flat().map((c) => {
            const selected = selKey === new Date(c.ms).toDateString();
            const visible = c.count > MAX ? c.meetings.slice(0, MAX - 1) : c.meetings;
            const overflow = c.count - visible.length;
            return (
              <button
                key={c.ms}
                onClick={() => onSelect(c.ms)}
                aria-pressed={selected}
                className={cn(
                  "focus-ring flex min-h-[4.25rem] flex-col gap-1 border-b border-r border-line p-1 text-left transition sm:min-h-[7rem] sm:p-1.5",
                  selected ? "bg-accent/[0.07] ring-1 ring-inset ring-accent/40" : "hover:bg-surface-2/50",
                  !c.inMonth && "bg-surface-2/20",
                )}
              >
                <span className={cn(
                  "tabular grid h-6 w-6 shrink-0 place-items-center self-start rounded-full text-xs",
                  c.isToday ? "bg-accent font-bold text-white" : c.inMonth ? "font-semibold text-fg" : "text-muted/40",
                )}>{c.day}</span>

                {/* Desktop: chips de juntas dentro del cuadro */}
                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  {visible.map((ev) => <EventChip key={ev.id} ev={ev} now={now} dim={!c.inMonth} />)}
                  {overflow > 0 && <span className="px-1 text-[11px] font-semibold text-muted">+{overflow} más</span>}
                </div>

                {/* Móvil: puntos (el texto no cabe en celdas tan angostas) */}
                {c.count > 0 && (
                  <span className="flex gap-0.5 pl-1 sm:hidden">
                    {Array.from({ length: Math.min(3, c.count) }).map((_, i) => (
                      <span key={i} className="h-1 w-1 rounded-full bg-accent" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel del día elegido */}
      {selectedMs && (
        <motion.div variants={reveal} className="mx-auto w-full max-w-2xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold tracking-tight text-fg">
              {dayLabel(selectedMs, now)}
              <span className="ml-2 text-caption font-medium text-muted">
                {selMeetings.length ? `${selMeetings.length} ${selMeetings.length === 1 ? "junta" : "juntas"}` : "sin juntas"}
              </span>
            </h3>
            <button
              onClick={() => onNewMeeting(selectedMs)}
              className="focus-ring inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-caption font-semibold text-accent transition hover:bg-accent/15 active:scale-[0.97]"
            >
              <Plus size={12} /> Agendar
            </button>
          </div>
          {selMeetings.length === 0 ? (
            <p className="rounded-card border border-line bg-surface px-3 py-4 text-center text-caption text-muted">Día despejado. Nada agendado.</p>
          ) : (
            <ul className="space-y-1.5">
              {selMeetings.map((ev) => <li key={ev.id}><CalRow ev={ev} memberByEmail={memberByEmail} /></li>)}
            </ul>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export type AgendaStatus = "loading" | "disconnected" | "ready";

// Toda la parte visual de la agenda. La página le pasa el estado ya resuelto; así el mismo
// tablero se puede previsualizar con datos de ejemplo fuera del gate de auth.
export function AgendaBoard({
  status, view, memberByEmail, now,
  mode, onMode, calEvents, monthAnchor, selectedMs, onSelectDay, onPrevMonth, onNextMonth, onToday, onNewMeeting,
}: {
  status: AgendaStatus;
  view: AgendaView | null;
  memberByEmail: Record<string, Member>;
  now: number;
  mode: AgendaMode;
  onMode: (m: AgendaMode) => void;
  calEvents: AgendaEvent[];
  monthAnchor: number;
  selectedMs: number | null;
  onSelectDay: (ms: number) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onNewMeeting: (dayMs?: number) => void;
}) {
  return (
    <div className={cn("mx-auto w-full transition-[max-width]", mode === "calendario" ? "max-w-4xl" : "max-w-2xl")}>
      <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
        <motion.header variants={reveal} className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">Agenda</h1>
            <p className="text-sm text-muted">Tus juntas de hoy y los próximos días, directo de tu calendario.</p>
          </div>
          {status === "ready" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNewMeeting()}
                className="glow-accent focus-ring inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-semibold text-white transition active:scale-[0.97]"
              >
                <Plus size={15} /> Nueva junta
              </button>
              <ModeToggle mode={mode} onMode={onMode} />
            </div>
          )}
        </motion.header>

        {status === "loading" ? (
          <div className="space-y-3">
            <div className="h-32 animate-pulse rounded-hero bg-surface-2/60" />
            {[0, 1].map((i) => <div key={i} className="h-16 animate-pulse rounded-card bg-surface-2/40" />)}
          </div>
        ) : status === "disconnected" ? (
          <motion.div variants={reveal} className="glass rounded-hero p-8 text-center sm:p-10">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent/12 text-accent"><Link2 size={22} /></div>
            <p className="font-display text-lg font-bold text-fg">Conecta tu Google Calendar</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              Para que tu agenda viva aquí. Cada quien ve solo su propio calendario; nadie más ve tus juntas.
            </p>
            <Link href="/ajustes" className="glow-accent mt-5 inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition active:scale-[0.97] focus-ring">
              Ir a Integraciones <ArrowRight size={15} />
            </Link>
          </motion.div>
        ) : mode === "calendario" ? (
          <CalendarMonth
            events={calEvents} anchor={monthAnchor} selectedMs={selectedMs} now={now}
            memberByEmail={memberByEmail} onSelect={onSelectDay} onPrev={onPrevMonth} onNext={onNextMonth}
            onToday={onToday} onNewMeeting={onNewMeeting}
          />
        ) : !view || view.total === 0 ? (
          <motion.div variants={reveal} className="glass rounded-hero p-10 text-center sm:p-12">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted"><Coffee size={22} /></div>
            <p className="font-display text-lg font-bold text-fg">Semana despejada</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted">Nada en tu calendario de aquí a 7 días. Todo tuyo para trabajo enfocado.</p>
            <div className="mt-4 inline-flex items-center gap-1.5 text-caption font-medium text-accent"><Sparkles size={13} /> Aprovéchala</div>
          </motion.div>
        ) : (
          <>
            <Spotlight view={view} memberByEmail={memberByEmail} />

            <div className="space-y-7">
              {view.days.map((d) => (
                <motion.section key={d.key} variants={reveal} className="space-y-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className={`font-display text-base font-bold tracking-tight ${d.isToday ? "text-fg" : "text-muted"}`}>{d.label}</h2>
                    <span className="tabular text-caption font-medium text-muted">
                      <CountUp value={d.count} /> {d.count === 1 ? "junta" : "juntas"} · {minutesLabel(d.busyMin)}
                    </span>
                  </div>

                  <div className="relative pl-5">
                    <span className="absolute bottom-3 left-[5px] top-3 w-px bg-line" aria-hidden />
                    <ul className="space-y-2">
                      {d.meetings.map((m, i) => {
                        const live = view.live?.id === m.id;
                        const soon = !live && m.start > now && m.start - now <= 15 * 60_000;
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
                            <span className={`absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--background)] ${live ? "bg-accent" : "bg-line"}`} aria-hidden />
                            <div className={`group flex items-center gap-3 rounded-card border px-3.5 py-3 transition ${
                              live ? "border-accent/40 bg-accent/[0.06]" : "border-line bg-surface hover:border-accent/30 hover:bg-surface-2/40"
                            }`}>
                              <div className="w-12 shrink-0">
                                <p className="tabular text-sm font-bold text-fg">{hhmm(m.start)}</p>
                                <p className="tabular whitespace-nowrap text-caption text-muted">{shortDur(Math.round((m.end - m.start) / 60_000))}</p>
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

// Reloj compartido para la página (granularidad de 30 s para "en curso/próxima").
export { useNow };
