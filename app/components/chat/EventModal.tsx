"use client";

import { useState } from "react";
import { Calendar, Video, Check, Loader2, ExternalLink } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { cn } from "@/lib/cn";

type Person = { name: string; email: string };

const pad = (n: number) => String(n).padStart(2, "0");

// Modal para crear una junta/evento en Google Calendar con invitados, desde el chat.
export function EventModal({
  open, onClose, people, defaultInvitees, onCreated, onInstant, channelName,
}: {
  open: boolean;
  onClose: () => void;
  people: Person[];
  defaultInvitees?: string[];
  onCreated: (summary: { title: string; whenLabel: string; link: string | null; attendees: string[] }) => void;
  onInstant?: (link: string) => void;
  channelName?: string;
}) {
  const now = new Date();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  const [time, setTime] = useState(`${pad((now.getHours() + 1) % 24)}:00`);
  const [dur, setDur] = useState(60);
  const [withMeet, setWithMeet] = useState(true);
  const [desc, setDesc] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultInvitees || []));
  const [saving, setSaving] = useState(false);
  const [instantLoading, setInstantLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState(false);

  const toggle = (email: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  const startInstant = async () => {
    if (instantLoading) return;
    setInstantLoading(true); setError(null); setNotConnected(false);
    try {
      const res = await fetch("/api/gcal/instant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: channelName ? `Llamada rápida — ${channelName}` : "Llamada rápida" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "no-gcal" || data.error === "reconnect") { setNotConnected(true); return; }
        setError(data.error || "No se pudo iniciar la llamada."); return;
      }
      if (data.link) onInstant?.(data.link);
      onClose();
    } finally { setInstantLoading(false); }
  };

  const create = async () => {
    if (!title.trim() || saving) return;
    setSaving(true); setError(null); setNotConnected(false);
    try {
      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + dur * 60000);
      const res = await fetch("/api/gcal/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), startISO: start.toISOString(), endISO: end.toISOString(), attendees: [...selected], description: desc.trim() || undefined, withMeet }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.error === "no-gcal" || data.error === "reconnect") { setNotConnected(true); return; }
        setError(data.error || "No se pudo crear el evento."); return;
      }
      const whenLabel = start.toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      onCreated({ title: title.trim(), whenLabel, link: data.event?.hangoutLink || data.event?.htmlLink || null, attendees: [...selected] });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva junta">
      {notConnected ? (
        <div className="space-y-3 py-2 text-center">
          <p className="text-sm text-muted">Para crear juntas necesitas <b className="text-fg">(re)conectar tu Google Calendar</b> — el permiso cambió para poder crear eventos.</p>
          <a href="/api/gcal/login" className="inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            <Calendar size={15} /> Conectar Google Calendar
          </a>
          <p className="text-caption text-muted">Después de conectar, vuelve a abrir “Nueva junta”.</p>
        </div>
      ) : (
        <>
          {onInstant && (
            <>
              <button onClick={startInstant} disabled={instantLoading} className="mb-3 flex w-full items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                {instantLoading ? <Loader2 size={15} className="animate-spin" /> : <Video size={15} />}
                {instantLoading ? "Creando llamada…" : "Reunirse ahora (Meet al instante)"}
              </button>
              <div className="mb-3 flex items-center gap-3 text-caption text-muted"><span className="h-px flex-1 bg-line" /> o agenda una junta <span className="h-px flex-1 bg-line" /></div>
            </>
          )}
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Ej. Junta de seguimiento Eleva" autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
            <Field label="Hora"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
          </div>

          <Field label="Duración">
            <div className="flex gap-1.5">
              {[30, 60, 90, 120].map((m) => (
                <button key={m} onClick={() => setDur(m)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-ring", dur === m ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent hover:text-accent")}>
                  {m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? " 30" : ""}`}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Invitados">
            <div className="flex flex-wrap gap-1.5">
              {people.length === 0 && <p className="text-xs text-muted">No hay correos del equipo disponibles.</p>}
              {people.map((p) => {
                const sel = selected.has(p.email);
                return (
                  <button key={p.email} onClick={() => toggle(p.email)} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-ring", sel ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent")}>
                    {sel && <Check size={11} />} {p.name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Descripción (opcional)">
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} className={cn(inputCls, "resize-none")} placeholder="Agenda, notas…" />
          </Field>

          <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            <Video size={15} className="text-muted" /> Crear enlace de Google Meet
          </label>

          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          <button onClick={create} disabled={saving || !title.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
            {saving ? "Creando y enviando invitaciones…" : "Crear y enviar invitaciones"}
            {!saving && <ExternalLink size={13} className="opacity-70" />}
          </button>
          <p className="mt-2 text-caption text-muted">Se crea en tu Google Calendar y se envían las invitaciones por correo a los seleccionados.</p>
        </>
      )}
    </Modal>
  );
}
