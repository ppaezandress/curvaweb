"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, X, Video } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/Avatar";
import { suggestForMeeting } from "@/lib/meeting-match";
import { refreshTimeRecords } from "@/lib/use-time-records";
import type { TimeRecord } from "@/lib/notion/fetchers";
import { cn } from "@/lib/cn";

type GEvent = { id: string; title: string; start: number; end: number; attendees: string[]; hangoutLink?: string };

const HANDLED_KEY = (uid: string) => `curva.gcal.handled.${uid}`;

// Vigila el calendario: cuando una junta TERMINA, ofrece registrar su tiempo
// (proyecto sugerido por el título + asistentes del equipo). Tú confirmas.
export function MeetingWatcher() {
  const { currentUserId } = useApp();
  const { clients, projects, tasks, members, clientById, projectById, addRecentEntries } = useData();
  const [pending, setPending] = useState<GEvent | null>(null);
  const [projectId, setProjectId] = useState<string>("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const me = currentUserId ? members.find((m) => m.id === currentUserId) : undefined;

  const handledSet = useCallback((): Set<string> => {
    if (!currentUserId) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(HANDLED_KEY(currentUserId)) || "[]")); } catch { return new Set(); }
  }, [currentUserId]);

  const markHandled = useCallback((id: string) => {
    if (!currentUserId) return;
    const s = handledSet(); s.add(id);
    try { localStorage.setItem(HANDLED_KEY(currentUserId), JSON.stringify([...s].slice(-200))); } catch { /* */ }
  }, [currentUserId, handledSet]);

  const suggestion = useMemo(() => {
    if (!pending) return null;
    return suggestForMeeting(pending.title, pending.attendees, { clients, projects, tasks, members });
  }, [pending, clients, projects, tasks, members]);

  // Cuando aparece una junta pendiente, precarga proyecto + asistentes sugeridos
  useEffect(() => {
    if (!pending || !suggestion) return;
    setProjectId(suggestion.projectId || "");
    const ids = new Set<string>(suggestion.attendeeMemberIds);
    if (currentUserId) ids.add(currentUserId); // yo siempre incluido
    setPicked(ids);
  }, [pending, suggestion, currentUserId]);

  // Polling de eventos
  useEffect(() => {
    if (!currentUserId) return;
    let alive = true;
    const check = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch("/api/gcal/events").then((x) => x.json());
        if (!alive || !r.connected) return;
        const now = Date.now();
        const handled = handledSet();
        const ended = (r.events as GEvent[])
          .filter((e) => e.end < now && e.end > now - 4 * 3600_000) // terminó hace <4h
          .filter((e) => e.attendees.length >= 1 || e.hangoutLink) // es junta/llamada
          .filter((e) => (e.end - e.start) >= 10 * 60_000) // dura ≥10 min
          .filter((e) => !handled.has(e.id));
        if (ended.length && !pending) setPending(ended[0]);
      } catch { /* */ }
    };
    check();
    const id = setInterval(check, 90_000);
    return () => { alive = false; clearInterval(id); };
  }, [currentUserId, handledSet, pending]);

  if (!pending) return null;

  const minutes = Math.round((pending.end - pending.start) / 60000);
  // Todo el equipo, con los detectados/tú arriba: así puedes registrar la junta también
  // para invitados que el detector no reconoció por correo.
  const teammates = members
    .filter((m) => m.name && m.name !== "—")
    .sort((a, b) => {
      const rank = (id: string) => (id === currentUserId ? 0 : suggestion?.attendeeMemberIds.includes(id) ? 1 : 2);
      return rank(a.id) - rank(b.id);
    });

  const dismiss = () => { markHandled(pending.id); setPending(null); };

  const confirm = async () => {
    setBusy(true);
    try {
      const proj = projectId ? projectById[projectId] : undefined;
      const clientId = proj?.clientId || suggestion?.clientId;
      const attendees = [...picked]
        .map((id) => members.find((m) => m.id === id))
        .filter(Boolean)
        .map((m) => ({ name: m!.name, minutes }));
      const res = await fetch("/api/time-entries", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: suggestion?.taskId,
          clientId,
          taskName: pending.title,
          area: "Junta",
          startedAt: pending.start,
          endedAt: pending.end,
          attendees,
        }),
      }).then((r) => r.json()).catch(() => ({} as { records?: TimeRecord[] }));
      // Muestra la junta al instante en el vistazo/historial y reconcilia con Notion (lag de
      // indexado) para que no haga falta recargar la página.
      if (Array.isArray(res.records)) addRecentEntries(res.records);
      setTimeout(() => { refreshTimeRecords(); }, 2500);
      setTimeout(() => { refreshTimeRecords(); }, 6000);
      markHandled(pending.id);
      setPending(null);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={dismiss} title="¿Registramos esta junta?"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button onClick={dismiss} className="text-sm text-muted hover:text-muted focus-ring rounded-full px-2 py-1">Descartar</button>
          <Button onClick={confirm} disabled={busy || picked.size === 0}>{busy ? "Registrando…" : `Registrar ${minutes} min`}</Button>
        </div>
      }>
      <div className="mb-4 flex items-start gap-3 rounded-card bg-accent/5 p-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent/15 text-accent">
          {pending.hangoutLink ? <Video size={18} /> : <CalendarClock size={18} />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-fg">{pending.title}</p>
          <p className="text-xs text-muted">{minutes} min{pending.hangoutLink ? " · videollamada" : ""}</p>
        </div>
      </div>

      <label className="mb-1.5 block text-sm font-semibold text-muted">Proyecto</label>
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
        className="mb-1 w-full rounded-control border border-line bg-surface px-3 py-2.5 text-sm outline-none focus-ring focus:border-accent">
        <option value="">— Sin proyecto (solo cliente/área) —</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{clientById[p.clientId]?.name ? `${clientById[p.clientId].name} · ` : ""}{p.name}</option>
        ))}
      </select>
      {suggestion?.label && <p className="mb-4 text-xs text-accent">Sugerido por el título: {suggestion.label}</p>}

      <label className="mb-1.5 mt-3 block text-sm font-semibold text-muted">¿Para quién lo registramos?</label>
      <div className="space-y-1">
        {teammates.map((m) => {
          const on = picked.has(m.id);
          return (
            <button key={m.id} onClick={() => setPicked((s) => { const n = new Set(s); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
              className={cn("flex w-full items-center gap-2.5 rounded-control border p-2 text-left transition focus-ring", on ? "border-accent bg-accent/5" : "border-line")}>
              <Avatar member={m} size={28} />
              <span className="flex-1 text-sm text-fg">{m.name}{m.id === currentUserId ? " (tú)" : ""}</span>
              {on && <Check size={15} className="text-accent" />}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-caption text-muted">Solo tú ves esto. El equipo nunca ve el título de tus juntas.</p>
    </Modal>
  );
}
