"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

type S = { loading: true } | { loading: false; connected: boolean; busy?: boolean };

// Conectar Google Calendar para mostrar "En junta" en la presencia.
// Usa solo freebusy (ocupado/libre); nunca lee títulos. Si no hay credenciales
// en el server, /now responde {connected:false} y se muestra el CTA de conectar.
export function GcalConnect() {
  const [state, setState] = useState<S>({ loading: true });

  const refresh = () => {
    fetch("/api/gcal/now")
      .then((r) => r.json())
      .then((d) => setState({ loading: false, connected: !!d.connected, busy: d.busy }))
      .catch(() => setState({ loading: false, connected: false }));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000);
    return () => clearInterval(id);
  }, []);

  if (state.loading) return null;

  if (state.connected) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-curva-blue/10 text-curva-blue">
          <CalendarClock size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">Calendario conectado</p>
          <p className="text-xs text-muted">{state.busy ? "Ahora: en junta 📅" : "Ahora: libre"}</p>
          <div className="mt-1 flex gap-3 text-[11px]">
            <a href="/api/gcal/login" className="font-medium text-curva-blue hover:underline">Reconectar</a>
            <a href="/api/gcal/logout" className="text-muted hover:text-rose-500 hover:underline">Desconectar</a>
          </div>
        </div>
        <span className={`inline-block h-2 w-2 rounded-full ${state.busy ? "bg-rose-500" : "bg-curva-teal"}`} />
      </div>
    );
  }

  return (
    <a
      href="/api/gcal/login"
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft transition focus-ring hover:border-curva-blue"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-curva-blue text-white">
        <CalendarClock size={20} />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">Conectar Google Calendar</p>
        <p className="text-xs text-muted">El equipo verá si estás en junta (solo ocupado/libre, sin títulos).</p>
      </div>
      <span className="rounded-full bg-curva-blue px-3 py-1.5 text-xs font-semibold text-white">Conectar</span>
    </a>
  );
}
