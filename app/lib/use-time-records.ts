"use client";

// Hook compartido de registros de tiempo. Un solo fetch a /api/time-entries,
// cacheado a nivel de módulo para que Análisis / Equipo / Dashboard no re-pidan.
// Es un pequeño store con suscriptores: cuando alguien registra tiempo (a mano o una
// junta del calendario) y llama refreshTimeRecords(), TODAS las vistas montadas que
// usan este hook se actualizan solas, sin que el usuario recargue la página.
import { useEffect, useState } from "react";
import type { TimeRecord } from "@/lib/notion/fetchers";

let cache: TimeRecord[] | null = null;
let inflight: Promise<TimeRecord[]> | null = null;
const listeners = new Set<(r: TimeRecord[]) => void>();

function load(): Promise<TimeRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => {
        cache = (d.records as TimeRecord[]) || [];
        listeners.forEach((l) => l(cache!));
        return cache;
      })
      .catch(() => {
        cache = [];
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Invalida el caché y re-pide a Notion, avisando a todas las instancias montadas.
// Se llama tras registrar tiempo. Notion indexa con unos segundos de lag, así que quien
// registra suele llamarlo diferido (y muestra el registro al instante vía recentEntries).
export function refreshTimeRecords(): Promise<TimeRecord[]> {
  cache = null;
  return load();
}

export function useTimeRecords() {
  const [records, setRecords] = useState<TimeRecord[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let alive = true;
    const onChange = (rs: TimeRecord[]) => { if (alive) { setRecords(rs); setLoading(false); } };
    listeners.add(onChange);
    load().then(onChange);
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, []);

  return { records, loading, reload: refreshTimeRecords };
}
