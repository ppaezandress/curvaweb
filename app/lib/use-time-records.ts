"use client";

// Hook compartido de registros de tiempo. Un solo fetch a /api/time-entries,
// cacheado a nivel de módulo para que Análisis / Equipo / Dashboard no re-pidan.
import { useEffect, useState } from "react";
import type { TimeRecord } from "@/lib/notion/fetchers";

let cache: TimeRecord[] | null = null;
let inflight: Promise<TimeRecord[]> | null = null;

function load(): Promise<TimeRecord[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/time-entries")
      .then((r) => r.json())
      .then((d) => {
        cache = (d.records as TimeRecord[]) || [];
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

export function useTimeRecords() {
  const [records, setRecords] = useState<TimeRecord[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let alive = true;
    load().then((rs) => {
      if (alive) {
        setRecords(rs);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const reload = async () => {
    cache = null;
    const rs = await load();
    setRecords(rs);
    return rs;
  };

  return { records, loading, reload };
}
