"use client";

// Registro local de qué música sonaba mientras trabajabas (para los recaps).
// Se guarda en localStorage; cada entrada = una canción detectada en un momento.

export type MusicEntry = {
  at: number; // epoch ms
  track: string;
  artist: string;
  genres: string[];
  taskId?: string;
};

const KEY = "curva.musiclog";

export function readMusicLog(): MusicEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMusicEntry(e: MusicEntry) {
  try {
    const log = readMusicLog();
    // Evita duplicar la MISMA canción en <2 min (poll repetido).
    const last = log[log.length - 1];
    if (last && last.track === e.track && e.at - last.at < 120000) return;
    log.push(e);
    // Cap para no crecer infinito.
    const trimmed = log.slice(-2000);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* noop */
  }
}
