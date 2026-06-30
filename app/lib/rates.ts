"use client";

import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// Tarifas por hora (MXN) por persona. Fuente real: Supabase (tabla app_rates),
// COMPARTIDA entre los admins. Cache en localStorage para render instantáneo.
const KEY = "curva.rates";
const DEFAULT_KEY = "__default__"; // fila de la tarifa default en el server

export type Rates = {
  default: number;
  byPerson: Record<string, number>;
};

const EMPTY: Rates = { default: 0, byPerson: {} };

function fromRows(rows: { key: string; rate: number }[]): Rates {
  const r: Rates = { default: 0, byPerson: {} };
  for (const row of rows) {
    if (row.key === DEFAULT_KEY) r.default = Number(row.rate) || 0;
    else r.byPerson[row.key] = Number(row.rate) || 0;
  }
  return r;
}

export function useRates() {
  const [rates, setRates] = useState<Rates>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1) cache local: render instantáneo
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRates({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
    // 2) fuente real: servidor (compartida entre admins)
    (async () => {
      try {
        if (supabaseConfigured()) {
          const sb = getSupabase();
          if (sb) {
            const { data } = await sb.from("app_rates").select("key,rate");
            if (data) {
              const next = fromRows(data as { key: string; rate: number }[]);
              setRates(next);
              try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
            }
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const persist = async (key: string, rate: number) => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("app_rates").upsert({ key, rate }, { onConflict: "key" });
  };

  const cache = (next: Rates) => {
    setRates(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* noop */ }
  };

  const rateFor = (personName: string) =>
    rates.byPerson[personName] || rates.default || 0;

  const setDefault = (n: number) => { cache({ ...rates, default: n }); persist(DEFAULT_KEY, n); };
  const setPerson = (name: string, n: number) => {
    cache({ ...rates, byPerson: { ...rates.byPerson, [name]: n } });
    persist(name, n);
  };

  return { rates, ready, rateFor, setDefault, setPerson };
}

export function money(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
