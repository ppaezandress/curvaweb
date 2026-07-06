"use client";

import { useEffect, useMemo, useState } from "react";
import { Terminal, Sparkles, Check, Copy } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Modal } from "@/components/Modal";

function ago(ts: number) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h} h`;
}

export function ClaudeCodeConnect() {
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

  const snippet = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:3000";
    const em = email || "tu-correo@empresa.com";
    return JSON.stringify({
      hooks: {
        UserPromptSubmit: [{ hooks: [{ type: "command", command: `curl -s -X POST ${origin}/api/timing/start -H 'x-curva-user: ${em}' -H 'Content-Type: application/json' --data-binary @- >/dev/null 2>&1 &` }] }],
        Stop: [{ hooks: [{ type: "command", command: `curl -s -X POST ${origin}/api/timing/stop -H 'x-curva-user: ${em}' -H 'Content-Type: application/json' --data-binary @- >/dev/null 2>&1 &` }] }],
      },
    }, null, 2);
  }, [email]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* */ }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 text-left text-fg shadow-soft transition focus-ring hover:border-accent active:scale-[0.99]">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent/10 text-accent"><Terminal size={20} /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Conectar Claude Code</span>
          <span className="block truncate text-xs text-muted">
            {last ? <span className="text-success">✓ Señal {ago(last)}</span> : "Mide el tiempo de IA solo"}
          </span>
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Conectar Claude Code">
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-muted">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-accent" />
            Mide <b className="text-fg">solo</b> el tiempo que la IA trabaja por ti — sin que toques nada. Lo configuras una vez y cada vez que uses Claude Code, el tiempo cae en tus métricas de IA, por proyecto.
          </p>

          <ol className="space-y-3 text-sm">
            <li>
              <p className="mb-1 font-semibold text-fg">1. Abre tu archivo de config</p>
              <code className="block rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">~/.claude/settings.json</code>
            </li>
            <li>
              <p className="mb-1 flex items-center justify-between font-semibold text-fg">
                2. Pega esto dentro
                <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted transition hover:border-accent hover:text-accent">
                  {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
              </p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-ink p-3 text-caption leading-relaxed text-muted">{snippet}</pre>
            </li>
          </ol>

          {!email && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">Tu correo no está en el equipo de Notion, así que el snippet trae un placeholder. Cámbialo por tu correo registrado.</p>
          )}

          <div className="flex items-center gap-2 rounded-control border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${last ? "bg-success" : "bg-surface-2"}`} />
            <span className={last ? "text-fg" : "text-muted"}>
              {last ? `Última señal recibida ${ago(last)} ✓` : "Aún sin señal. Manda un mensaje en Claude Code para probar."}
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}
