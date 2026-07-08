"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import { statusToneClass } from "@/lib/mock-data";

// Estados canónicos de Notion (el backend acepta cualquiera vía PATCH /api/tasks).
const STATUSES = ["SIN EMPEZAR", "EN CURSO", "POR VALIDAR", "EN ESPERA", "DEMORADA", "DONE"];

// Badge de estado clickeable: abre un menú para cambiar el estado de la tarea a mano.
export function StatusPicker({
  taskId,
  status,
  onChanged,
}: {
  taskId: string;
  status: string;
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

  const choose = async (s: string) => {
    setOpen(false);
    if (s === status || saving) return;
    setSaving(true);
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status: s }),
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
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium transition hover:opacity-80 focus-ring disabled:opacity-50 ${statusToneClass(status)}`}
        title="Cambiar estado"
        aria-label="Cambiar estado de la tarea"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : null}
        {status || "Sin estado"} <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-control border border-line bg-[var(--surface-solid)] py-1 shadow-float">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={(e) => { e.stopPropagation(); choose(s); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-2"
            >
              <span className={`rounded-full px-2 py-0.5 text-caption font-medium ${statusToneClass(s)}`}>{s}</span>
              {s === status && <Check size={14} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
