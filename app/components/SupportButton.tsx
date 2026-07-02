"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, Bug, Lightbulb, MessageSquare, ImagePlus, Camera, X, Check, Loader2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";

type FbType = "problema" | "idea" | "comentario";
const TYPES: { key: FbType; label: string; icon: typeof Bug; hint: string }[] = [
  { key: "problema", label: "Problema", icon: Bug, hint: "Algo falló o no funcionó." },
  { key: "idea", label: "Idea", icon: Lightbulb, hint: "Algo que te gustaría que hiciera." },
  { key: "comentario", label: "Comentario", icon: MessageSquare, hint: "Lo que sea — nos sirve todo." },
];

// Feedback desde CUALQUIER pantalla: problema / idea / comentario + captura opcional.
// Aterriza en Notion (DB "Feedback del equipo") + respaldo en Supabase.
export function SupportButton() {
  const pathname = usePathname();
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FbType>("comentario");
  const [desc, setDesc] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const reset = () => { setDesc(""); setShot(null); setState("idle"); setType("comentario"); };

  // Captura la pantalla actual (la app), excluyendo este modal y el botón flotante.
  const captureScreen = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const { toJpeg } = await import("html-to-image");
      // Timeout: en pantallas pesadas html-to-image puede colgarse. Con la carrera,
      // a los 8s se rinde en vez de dejar el botón atorado en "Capturando…".
      const dataUrl = await Promise.race([
        toJpeg(document.body, {
          quality: 0.7, pixelRatio: 0.7, cacheBust: true,
          filter: (node) => {
            const el = node as HTMLElement;
            if (el?.classList?.contains?.("modal-backdrop")) return false;
            if (el?.dataset?.noCapture === "1") return false;
            return true;
          },
        }),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      setShot(dataUrl);
    } catch {
      alert("No se pudo capturar esta pantalla. Puedes subir una imagen en su lugar.");
    } finally {
      setCapturing(false);
    }
  };

  const onFile = (file?: File) => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1280 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      try { setShot(c.toDataURL("image/jpeg", 0.7)); } catch { /* imagen rara */ }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const submit = async () => {
    if (desc.trim().length < 2 || state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, description: desc.trim(), page: pathname, screenshot: shot, userAgent: navigator.userAgent, userName: me?.name }),
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
        data-no-capture="1"
        className="fixed bottom-20 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-sm font-semibold text-fg shadow-float backdrop-blur transition hover:border-accent focus-ring sm:bottom-5"
        aria-label="Dar feedback"
      >
        <MessageSquarePlus size={15} className="text-accent" /> <span className="hidden sm:inline">Feedback</span>
      </button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Tu feedback"
        footer={
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">{state === "error" ? "No se pudo enviar — intenta de nuevo." : "Le llega al equipo al instante."}</p>
            <button
              onClick={submit}
              disabled={desc.trim().length < 2 || state === "busy" || state === "done"}
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition focus-ring active:scale-95 disabled:opacity-40"
            >
              {state === "busy" ? <Loader2 size={15} className="animate-spin" /> : state === "done" ? <Check size={15} /> : null}
              {state === "done" ? "¡Gracias!" : state === "busy" ? "Enviando…" : "Enviar"}
            </button>
          </div>
        }
      >
        {/* Tipo */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const on = type === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-semibold transition focus-ring ${on ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-muted hover:border-accent/40"}`}
              >
                <Icon size={18} /> {t.label}
              </button>
            );
          })}
        </div>

        <Field label="Cuéntanos">
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            placeholder={TYPES.find((t) => t.key === type)?.hint}
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={captureScreen}
                disabled={capturing}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm font-semibold text-fg transition hover:border-accent focus-ring disabled:opacity-50"
              >
                {capturing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} className="text-accent" />}
                {capturing ? "Capturando…" : "Capturar esta pantalla"}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-muted transition hover:border-accent">
                <ImagePlus size={16} /> Subir imagen
                <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>
          )}
        </Field>

        <p className="text-[11px] text-muted">📸 "Capturar esta pantalla" toma una foto de lo que ves ahora (sin el recuadro de feedback). También adjuntamos en qué pantalla estás.</p>
      </Modal>
    </>
  );
}
