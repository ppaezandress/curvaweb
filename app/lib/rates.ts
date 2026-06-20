"use client";

import { useEffect, useState } from "react";

// Tarifas por hora (MXN) por persona, guardadas localmente.
// Sirven para estimar el costo del tiempo (rentabilidad).
const KEY = "curva.rates";

export type Rates = {
  default: number;
  byPerson: Record<string, number>;
};

const EMPTY: Rates = { default: 0, byPerson: {} };

export function useRates() {
  const [rates, setRates] = useState<Rates>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRates({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
    setReady(true);
  }, []);

  const save = (next: Rates) => {
    setRates(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  };

  const rateFor = (personName: string) =>
    rates.byPerson[personName] || rates.default || 0;

  const setDefault = (n: number) => save({ ...rates, default: n });
  const setPerson = (name: string, n: number) =>
    save({ ...rates, byPerson: { ...rates.byPerson, [name]: n } });

  return { rates, ready, rateFor, setDefault, setPerson };
}

export function money(n: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
