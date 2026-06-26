"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone, Sparkles, Check, Copy, ShieldCheck } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal } from "@/components/Modal";

function ago(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

const CMD = "node tools/claude-desktop-watcher.mjs";

export function ClaudeDesktopConnect() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const email = me?.email || "";

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState<number | null>(null);

  useEffect(() => {
    if (!email) return;
    const tick = () => fetch(`/api/timing/status?u=${encodeURIComponent(email)}`).then((r) => r.json()).then((d) => setLast(d.lastSignal || null)).catch(() => {});
    tick();
    const id = setInterval(tick, 20000);
    return () => clearInterval(id);
  }, [email]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(CMD); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left text-fg shadow-soft transition focus-ring hover:border-curva-indigo active:scale-[0.99]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-curva-indigo/10 text-curva-indigo"><MonitorSmartphone size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Conectar Claude Desktop</span>
          <span className="block truncate text-xs text-muted">
            {last ? <span className="text-curva-teal">✓ Señal {ago(last)}</span> : "Mide el modo agente de Desktop"}
          </span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Conectar Claude Desktop">
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-curva-indigo" />
            Mide el tiempo del <b className="text-fg">modo agente</b> de Claude Desktop (las tareas largas que la IA resuelve por ti). El tiempo cae en tus métricas de IA, por proyecto.
          </p>

          <p className="flex items-start gap-2 rounded-xl bg-curva-teal/5 px-3 py-2.5 text-xs text-muted">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-curva-teal" />
            Solo se leen <b className="text-fg">metadatos</b> (tiempos, proyecto, tu correo). <b className="text-fg">Nunca</b> el contenido de tus conversaciones.
          </p>

          <ol className="space-y-3 text-sm">
            <li>
              <p className="mb-1 font-semibold text-fg">1. Con la app abierta, corre en tu terminal</p>
              <p className="mb-1 text-xs text-muted">Desde la carpeta del proyecto (<code className="rounded bg-surface-2 px-1">~/Documents/curva/app</code>):</p>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-ink px-3 py-2.5">
                <code className="text-xs text-zinc-100">{CMD}</code>
                <button onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface/10 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-surface/20">
                  {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
              </div>
            </li>
            <li>
              <p className="font-semibold text-fg">2. Déjalo corriendo</p>
              <p className="text-xs text-muted">Reporta cada sesión de modo agente cuando termina. A futuro se integra en la app de escritorio para que no tengas que correrlo a mano.</p>
            </li>
          </ol>

          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${last ? "bg-curva-teal" : "bg-zinc-300"}`} />
            <span className={last ? "text-fg" : "text-muted"}>
              {last ? `Última señal recibida ${ago(last)} ✓` : "Aún sin señal. Corre el comando y usa el modo agente de Desktop."}
            </span>
          </div>

          <p className="text-[11px] text-muted">Best-effort: lee archivos locales de Claude Desktop, así que una actualización de la app podría requerir ajustar el conector.</p>
        </div>
      </Modal>
    </>
  );
}
