"use client";

// Rango de fechas compartido por una pantalla, persistido en la URL (?range=…)
// para deep-link y sobrevivir recargas. Sin useSearchParams (evita Suspense en
// rutas estáticas): lee/escribe window.location con history.replaceState.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { resolveRange, type DateRange, type Preset } from "@/lib/range";

type Ctx = {
  range: DateRange;
  setPreset: (p: Preset) => void;
  setCustom: (from: number, to: number) => void;
};

const RangeCtx = createContext<Ctx | null>(null);

function readInitial(fallback: Preset): { preset: Preset; from?: number; to?: number } {
  if (typeof window === "undefined") return { preset: fallback };
  const sp = new URLSearchParams(window.location.search);
  const p = sp.get("range") as Preset | null;
  const from = Number(sp.get("from"));
  const to = Number(sp.get("to"));
  if (p === "custom" && from && to) return { preset: "custom", from, to };
  const valid: Preset[] = ["this-week", "last-week", "7d", "30d", "90d", "month", "all"];
  return { preset: p && valid.includes(p) ? p : fallback };
}

function writeUrl(range: DateRange) {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  sp.set("range", range.preset);
  if (range.preset === "custom") {
    sp.set("from", String(range.from));
    sp.set("to", String(range.to));
  } else {
    sp.delete("from");
    sp.delete("to");
  }
  const url = `${window.location.pathname}?${sp.toString()}`;
  window.history.replaceState(null, "", url);
}

export function DateRangeProvider({
  children,
  defaultPreset = "30d",
}: {
  children: React.ReactNode;
  defaultPreset?: Preset;
}) {
  const [range, setRange] = useState<DateRange>(() => {
    const init = readInitial(defaultPreset);
    return resolveRange(init.preset, init.from && init.to ? { from: init.from, to: init.to } : undefined);
  });

  // Sincroniza desde la URL una vez montado (por si SSR usó el default).
  useEffect(() => {
    const init = readInitial(defaultPreset);
    setRange(resolveRange(init.preset, init.from && init.to ? { from: init.from, to: init.to } : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreset = (p: Preset) => {
    const r = resolveRange(p);
    setRange(r);
    writeUrl(r);
  };
  const setCustom = (from: number, to: number) => {
    const r = resolveRange("custom", { from, to });
    setRange(r);
    writeUrl(r);
  };

  const value = useMemo(() => ({ range, setPreset, setCustom }), [range]);
  return <RangeCtx.Provider value={value}>{children}</RangeCtx.Provider>;
}

export function useDateRange(): Ctx {
  const ctx = useContext(RangeCtx);
  if (!ctx) throw new Error("useDateRange debe usarse dentro de <DateRangeProvider>");
  return ctx;
}
