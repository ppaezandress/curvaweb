"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy, ImagePlus, X, Check, Loader2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";

// Soporte del piloto: cualquiera reporta una falla con descripción + screenshot opcional.
// Aterriza en support_reports (privada). Pensado para cachar bricks durante la semana.
export function SupportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const reset = () => { setDesc(""); setShot(null); setState("idle"); };

  const onFile = (file?: File) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      try { setShot(c.toDataURL("image/jpeg", 0.7)); } catch { /* imagen rara → sin screenshot */ }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const submit = async () => {
    if (desc.trim().length < 3 || state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc.trim(), page: pathname, screenshot: shot, userAgent: navigator.userAgent }),
      });
      const d = await r.json();
      setState(d.ok ? "done" : "error");
      if (d.ok) setTimeout(() => { setOpen(false); reset(); }, 1400);
    } catch { setState("error"); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-sm font-semibold text-fg shadow-float backdrop-blur transition hover:border-accent focus-ring sm:bottom-5"
        aria-label="Reportar un problema"
      >
        <LifeBuoy size={15} className="text-accent" /> <span className="hidden sm:inline">Reportar</span>
      </button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Reportar un problema"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{state === "error" ? "No se pudo enviar — intenta de nuevo." : "Lo revisamos durante el piloto."}</p>
            <button
              onClick={submit}
              disabled={desc.trim().length < 3 || state === "busy" || state === "done"}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition focus-ring active:scale-95 disabled:opacity-40"
            >
              {state === "busy" ? <Loader2 size={15} className="animate-spin" /> : state === "done" ? <Check size={15} /> : null}
              {state === "done" ? "¡Gracias!" : state === "busy" ? "Enviando…" : "Enviar"}
            </button>
          </div>
        }
      >
        <Field label="¿Qué pasó?">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            placeholder="Cuéntanos qué falló o qué esperabas que pasara…"
            className={`${inputCls} resize-none`}
            autoFocus
          />
        </Field>

        <Field label="Captura (opcional)">
          {shot ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shot} alt="captura" className="max-h-44 rounded-xl border border-line" />
              <button onClick={() => setShot(null)} className="absolute -right-2 -top-2 rounded-full bg-ink p-1 text-white shadow-soft focus-ring" aria-label="Quitar captura"><X size={13} /></button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-muted transition hover:border-accent">
              <ImagePlus size={16} /> Adjuntar una imagen
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          )}
        </Field>

        <p className="text-[11px] text-muted">Adjuntamos automáticamente la pantalla en la que estás y tu navegador, para ubicar la falla.</p>
      </Modal>
    </>
  );
}
