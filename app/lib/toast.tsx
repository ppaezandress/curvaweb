"use client";

// Toast mínimo, sin dependencias. `toast(msg)` se llama imperativamente desde
// cualquier handler; <Toaster/> (montado en el layout) lo renderiza. Reemplaza
// los alert() nativos (que rompen la estética).
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";
// `action` sirve para ofrecer un arrepentimiento inmediato ("Deshacer"). Nació para el
// control por gestos: si la cámara entiende mal, deshacer tiene que estar a un clic y no
// obligar a nadie a ir a arreglar su historial a mano.
export type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: ToastTone; action?: ToastAction };

let listeners: ((t: Toast) => void)[] = [];
let counter = 0;

export function toast(message: string, opts?: { tone?: ToastTone; action?: ToastAction }) {
  const t: Toast = { id: ++counter, message, tone: opts?.tone ?? "info", action: opts?.action };
  listeners.forEach((l) => l(t));
}

const toneCfg: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  success: { icon: CheckCircle2, cls: "text-success" },
  error: { icon: AlertCircle, cls: "text-danger" },
  info: { icon: Info, cls: "text-accent" },
};

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const l = (t: Toast) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== t.id)), 4200);
    };
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  const dismiss = (id: number) => setItems((x) => x.filter((i) => i.id !== id));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite" role="status">
      {items.map((t) => {
        const { icon: Icon, cls } = toneCfg[t.tone];
        return (
          <div
            key={t.id}
            className="dock-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-control border border-line bg-surface px-4 py-3 text-sm text-fg shadow-float"
          >
            <Icon size={17} className={`mt-0.5 shrink-0 ${cls}`} />
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                className="focus-ring shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold text-accent transition hover:bg-accent/10"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Cerrar" className="focus-ring -mr-1 shrink-0 rounded-md p-0.5 text-muted transition hover:text-fg">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
