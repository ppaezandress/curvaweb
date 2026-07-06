"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => setMounted(true), []);

  // Enfoque + scroll-lock: SOLO al abrir/cerrar. Antes esto vivía junto al listener
  // de teclado en un efecto con dep `onClose`; como onClose llega como arrow inline
  // (nueva identidad en cada render), el efecto se re-ejecutaba en CADA tecla y el
  // requestAnimationFrame reenfocaba el panel, robándole el foco al textarea
  // ("escribo y me saca del cursor"). Al depender solo de `open`, el panel se enfoca
  // una vez al abrir y no vuelve a robar el foco mientras se escribe.
  useEffect(() => {
    if (!open) return;
    // Devuelve el foco a quien abrió el modal al cerrarlo.
    const opener = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    // Enfoca el panel al abrir (lectores de pantalla anuncian el diálogo).
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = "";
      cancelAnimationFrame(raf);
      opener?.focus?.();
    };
  }, [open]);

  // Listener de teclado (Escape + focus-trap con Tab). Puede re-ejecutarse en cada
  // render sin efectos secundarios: solo re-adjunta el listener, no toca el foco.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // Focus-trap: Tab cicla dentro del panel, no se escapa al fondo.
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // Portal a <body>: evita que un ancestro con transform (animaciones .rise)
  // "atrape" el backdrop fixed y lo recorte a un rectángulo.
  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface shadow-float outline-none sm:rounded-hero"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="font-display text-lg font-bold text-fg">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg focus-ring"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

// Un solo input en todo el producto: reexportamos las clases base del primitivo
// (traen focus-ring accesible y el tamaño de cuerpo del token). Antes esto era una
// copia que se había desincronizado (text-sm, sin focus-ring).
export { inputBase as inputCls } from "@/components/ui/Input";
