"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Video, X } from "lucide-react";

type Ev = { id: string; title: string; start: number; end: number; hangoutLink?: string };

// Recordatorio flotante de la próxima junta: aparece cuando faltan ≤15 min y ofrece
// unirse al Meet. Polling ligero (60s, pausado si la pestaña está oculta).
export function MeetingReminder() {
  const [ev, setEv] = useState<Ev | null>(null);
  const [now, setNow] = useState(0);
  const dismissed = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/gcal/upcoming");
        const d = await r.json();
        if (!alive || !d.connected) { setEv(null); return; }
        const t = Date.now();
        const next = (d.events as Ev[])
          .filter((e) => e.start > t - 60_000 && !dismissed.current.has(e.id))
          .sort((a, b) => a.start - b.start)[0] || null;
        setEv(next);
        setNow(t);
      } catch { /* sin conexión: no molestar */ }
    };
    load();
    const poll = setInterval(load, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!ev || !now) return null;
  const mins = Math.round((ev.start - now) / 60000);
  if (mins > 15 || mins < -5) return null; // solo cuando se acerca o recién empezó
  const label = mins > 1 ? `empieza en ${mins} min` : mins >= 0 ? "empieza ahora" : "ya empezó";

  return (
    <div className="pointer-events-auto fixed bottom-24 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-[var(--surface-solid)] py-2 pl-2.5 pr-2 shadow-float sm:bottom-6">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent"><Calendar size={17} /></span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">{ev.title}</p>
        <p className="text-xs text-muted">Junta {label}</p>
      </div>
      {ev.hangoutLink && (
        <a href={ev.hangoutLink} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 focus-ring">
          <Video size={13} /> Unirse
        </a>
      )}
      <button onClick={() => { dismissed.current.add(ev.id); setEv(null); }} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Descartar recordatorio">
        <X size={14} />
      </button>
    </div>
  );
}
