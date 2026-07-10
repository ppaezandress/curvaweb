"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { toast } from "@/lib/toast";

const D = 280; // viewport cuadrado (px en pantalla)
const OUT = 512; // resolución de salida (px)

// Modal para ajustar la foto de perfil: arrastrar para mover + slider de zoom.
// Recorta a un cuadrado (que el Avatar muestra como círculo) y devuelve un Blob JPEG.
// `source` puede ser un File recién elegido O la URL de la foto que YA está puesta
// (para re-encuadrar sin volver a subir un archivo).
export function AvatarCropModal({
  source,
  onCancel,
  onConfirm,
}: {
  source: File | string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const isRemote = typeof source === "string";
  const [mounted, setMounted] = useState(false);
  const [url, setUrl] = useState("");
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  // Punto de la imagen (fracción 0–1) que cae en el CENTRO del visor. Así el zoom
  // conserva el centro automáticamente y el arrastre solo mueve este punto.
  const [center, setCenter] = useState({ fx: 0.5, fy: 0.5 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ px: number; py: number; fx: number; fy: number } | null>(null);
  const imgEl = useRef<HTMLImageElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    // File → objectURL local; string → la URL remota tal cual (foto ya subida).
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    const src = objectUrl ?? (source as string);
    setUrl(src);
    const img = new Image();
    if (isRemote) img.crossOrigin = "anonymous"; // permite exportar a canvas sin contaminarlo
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source, isRemote]);

  const cover = nat ? Math.max(D / nat.w, D / nat.h) : 1;
  const eff = cover * zoom;
  const dw = nat ? nat.w * eff : D;
  const dh = nat ? nat.h * eff : D;

  // Clampa la fracción para que la imagen siempre cubra el visor (sin huecos).
  const clampF = (f: number, span: number) => {
    const half = D / 2 / span;
    return Math.min(1 - half, Math.max(half, f));
  };
  const fx = clampF(center.fx, dw);
  const fy = clampF(center.fy, dh);
  const posX = D / 2 - fx * dw;
  const posY = D / 2 - fy * dh;

  const onDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, fx, fy };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setCenter({
      fx: drag.current.fx - (e.clientX - drag.current.px) / dw,
      fy: drag.current.fy - (e.clientY - drag.current.py) / dh,
    });
  };
  const onUp = () => { drag.current = null; };

  const confirm = async () => {
    if (!nat || !imgEl.current) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const f = OUT / D;
      ctx.drawImage(imgEl.current, posX * f, posY * f, dw * f, dh * f);
      // toBlob lanza SecurityError si el canvas quedó contaminado (imagen remota sin CORS).
      const blob: Blob | null = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
      if (blob) onConfirm(blob);
    } catch {
      toast("No se pudo procesar la imagen. Vuelve a subir la foto para ajustarla.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" data-no-capture>
      <div className="modal-panel w-full max-w-sm rounded-hero bg-[var(--surface-solid)] p-5 shadow-float">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-fg">Ajusta tu foto</h3>
          <button onClick={onCancel} className="text-muted transition hover:text-fg focus-ring rounded-full" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-full border border-line bg-surface-2 active:cursor-grabbing"
          style={{ width: D, height: D }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgEl}
              src={url}
              alt=""
              crossOrigin={isRemote ? "anonymous" : undefined}
              draggable={false}
              style={{ position: "absolute", left: posX, top: posY, width: dw, height: dh, maxWidth: "none" }}
            />
          )}
          {/* aro guía */}
          <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/60" />
        </div>

        <div className="mt-4 flex items-center gap-2">
          <ZoomIn size={16} className="shrink-0 text-muted" />
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-2 accent-[var(--color-accent)]"
            aria-label="Zoom"
          />
        </div>
        <p className="mt-1 text-center text-xs text-muted">Arrastra para mover · desliza para acercar</p>

        <div className="mt-4 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-muted transition hover:border-muted/40 focus-ring">
            Cancelar
          </button>
          <button onClick={confirm} disabled={busy || !nat} className="flex-1 rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 focus-ring">
            {busy ? "Guardando…" : "Usar foto"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
