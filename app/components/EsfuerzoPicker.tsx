"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2, Gauge } from "lucide-react";

// Valores canónicos del "Esfuerzo" en Notion (el backend los mapea vía PATCH /api/tasks).
const WEIGHTS = ["Ligera", "Media", "Pesada"] as const;
type Weight = (typeof WEIGHTS)[number];

const toneOf = (w?: string) =>
  w === "Pesada"
    ? "bg-danger/15 text-danger"
    : w === "Media"
      ? "bg-warn/15 text-warn"
      : w === "Ligera"
        ? "bg-success/15 text-success"
        : "bg-surface-2 text-muted";

// Badge de esfuerzo clickeable: permite corregir a mano el esfuerzo de una tarea
// (útil cuando vino de Notion con el valor equivocado). Espejo de StatusPicker.
export function EsfuerzoPicker({
  taskId,
  weight,
  onChanged,
}: {
  taskId: string;
  weight?: string;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const choose = async (w: Weight) => {
    setOpen(false);
    if (w === weight || saving) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, weight: w }),
      });
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        disabled={saving}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium transition hover:opacity-80 focus-ring disabled:opacity-50 ${toneOf(weight)}`}
        title="Cambiar esfuerzo"
        aria-label="Cambiar esfuerzo de la tarea"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Gauge size={11} />}
        {weight || "Sin esfuerzo"} <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-control border border-line bg-[var(--surface-solid)] py-1 shadow-float">
          {WEIGHTS.map((w) => (
            <button
              key={w}
              onClick={(e) => { e.stopPropagation(); choose(w); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-2"
            >
              <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${toneOf(w)}`}>{w}</span>
              {w === weight && <Check size={14} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
