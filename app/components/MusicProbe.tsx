"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/app-context";
import { addMusicEntry } from "@/lib/music-log";

// Mientras hay un cronómetro activo, consulta qué suena en Spotify cada ~45s
// y lo guarda en el log local (para los recaps). No hace nada si no hay timer
// o si Spotify no está conectado.
export function MusicProbe() {
  const { active } = useApp();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch("/api/spotify/now");
        const d = await r.json();
        if (cancelled || !d.connected || !d.playing || !d.track) return;
        addMusicEntry({
          at: Date.now(),
          track: d.track,
          artist: d.artist || "",
          genres: d.genres || [],
          taskId: active.taskId,
        });
      } catch {
        /* noop */
      }
    };

    poll();
    const id = setInterval(poll, 45000);
    return () => { cancelled = true; clearInterval(id); };
  }, [active]);

  return null;
}
