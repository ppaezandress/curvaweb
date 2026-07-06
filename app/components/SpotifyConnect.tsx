"use client";

import { useEffect, useState } from "react";
import { Music, Loader2 } from "lucide-react";

type NowState =
  | { loading: true }
  | { loading: false; configured: boolean; connected: boolean; playing?: boolean; track?: string; artist?: string; genres?: string[] };

// Tarjeta para conectar Spotify y ver qué suena. Si Spotify no está configurado
// (sin credenciales), no muestra nada.
export function SpotifyConnect() {
  const [state, setState] = useState<NowState>({ loading: true });

  const refresh = () => {
    fetch("/api/spotify/now")
      .then((r) => r.json())
      .then((d) =>
        setState({
          loading: false,
          configured: d.connected !== undefined,
          connected: !!d.connected,
          playing: d.playing,
          track: d.track,
          artist: d.artist,
          genres: d.genres,
        }),
      )
      .catch(() => setState({ loading: false, configured: false, connected: false }));
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  if (state.loading) return null;
  // Si no hay credenciales en el server, /now responde {connected:false} igual;
  // distinguimos "no configurado" mostrando siempre el card pero con CTA de conectar.

  if (state.connected) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-soft">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-spotify/10 text-spotify">
          <Music size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {state.playing && state.track ? (
            <>
              <p className="truncate text-sm font-semibold text-fg">{state.track}</p>
              <p className="truncate text-xs text-muted">{state.artist} · sonando ahora</p>
              {state.genres && state.genres.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {state.genres.slice(0, 3).map((g) => (
                    <span key={g} className="rounded-full bg-spotify/10 px-2 py-0.5 text-caption font-medium capitalize text-spotify">{g}</span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-fg">Spotify conectado</p>
              <p className="text-xs text-muted">Reproduce algo y lo registramos para tu recap.</p>
            </>
          )}
        </div>
        <span className="curva-live-dot inline-block h-2 w-2 rounded-full bg-spotify" />
      </div>
    );
  }

  return (
    <a
      href="/api/spotify/login"
      className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-soft transition hover:border-spotify"
    >
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-control bg-spotify text-white">
        <Music size={20} />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-fg">Conectar Spotify</p>
        <p className="text-xs text-muted">Descubre qué música acompaña tu mejor trabajo.</p>
      </div>
      <span className="rounded-full bg-spotify px-3 py-1.5 text-xs font-semibold text-white">Conectar</span>
    </a>
  );
}
