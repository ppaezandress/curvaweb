"use client";

import { useEffect, useState } from "react";
import { Calendar, Video, ExternalLink } from "lucide-react";
import { Modal } from "@/components/Modal";

type Ev = { id: string; title: string; start: number; end: number; hangoutLink?: string };

// Agenda del canal: próximas juntas (12h) del usuario. Si el canal es de un cliente,
// las que mencionan al cliente en el título salen primero.
export function AgendaModal({ open, onClose, clientName }: { open: boolean; onClose: () => void; clientName?: string }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/gcal/upcoming")
      .then((r) => r.json())
      .then((d) => { setConnected(!!d.connected); setEvents((d.events as Ev[]) || []); })
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, [open]);

  const sorted = [...events].sort((a, b) => {
    if (clientName) {
      const ac = a.title.toLowerCase().includes(clientName.toLowerCase()) ? 0 : 1;
      const bc = b.title.toLowerCase().includes(clientName.toLowerCase()) ? 0 : 1;
      if (ac !== bc) return ac - bc;
    }
    return a.start - b.start;
  });

  return (
    <Modal open={open} onClose={onClose} title="Próximas juntas">
      {loading && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
      {!loading && !connected && (
        <div className="space-y-3 py-2 text-center">
          <p className="text-sm text-muted">Conecta tu Google Calendar para ver tu agenda.</p>
          <a href="/api/gcal/login" className="inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"><Calendar size={15} /> Conectar Google Calendar</a>
        </div>
      )}
      {!loading && connected && sorted.length === 0 && (
        <p className="rounded-card border border-dashed border-line py-8 text-center text-sm text-muted">No tienes juntas en las próximas horas.</p>
      )}
      <div className="space-y-1.5">
        {!loading && connected && sorted.map((e) => {
          const when = new Date(e.start).toLocaleString("es-MX", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          return (
            <div key={e.id} className="flex items-center gap-3 rounded-control border border-line px-3 py-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Calendar size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{e.title}</p>
                <p className="truncate text-caption text-muted">{when}</p>
              </div>
              {e.hangoutLink && (
                <a href={e.hangoutLink} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"><Video size={13} /> Unirse</a>
              )}
              {!e.hangoutLink && <ExternalLink size={14} className="shrink-0 text-muted" />}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
