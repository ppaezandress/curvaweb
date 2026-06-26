"use client";

import { useState } from "react";
import { Sparkles, Database, RefreshCw, Loader2, Check } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Toggle } from "@/components/ui/Toggle";
import { ClaudeCodeConnect } from "@/components/ClaudeCodeConnect";
import { ClaudeDesktopConnect } from "@/components/ClaudeDesktopConnect";
import { SpotifyConnect } from "@/components/SpotifyConnect";
import { GcalConnect } from "@/components/GcalConnect";

export function IntegrationsSettings() {
  const { aiEnabled, setAiEnabled } = useApp();

  return (
    <div className="space-y-6">
      {/* Tiempo con IA — interruptor maestro (opt-in) */}
      <div>
        <h3 className="flex items-center gap-2 font-display font-bold text-fg">
          <Sparkles size={16} className="text-curva-indigo" /> Tiempo con IA
        </h3>
        <p className="mb-3 mt-0.5 text-sm text-muted">
          Mide solo el tiempo que la IA trabaja por ti, sin que toques nada. Si no usas Claude, déjalo apagado y la app se queda en cronómetro a mano.
        </p>
        <div className="rounded-2xl border border-curva-indigo/30 bg-surface shadow-soft">
          <Toggle
            icon={<Sparkles size={16} className="text-curva-indigo" />}
            label="Activar el tiempo con IA"
            hint="Muestra la tarjeta de IA, el botón ✨IA en las tareas y la captura automática."
            on={aiEnabled}
            onChange={setAiEnabled}
            tone="indigo"
          />
        </div>
      </div>

      {/* Conectores de captura automática (solo si el tiempo con IA está activo) */}
      {aiEnabled && (
        <div>
          <h3 className="font-display font-bold text-fg">Captura automática de IA</h3>
          <p className="mb-3 mt-0.5 text-sm text-muted">Conecta Claude para que el tiempo de IA se registre solo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ClaudeCodeConnect />
            <ClaudeDesktopConnect />
          </div>
        </div>
      )}

      {/* Contexto y cultura */}
      <div>
        <h3 className="font-display font-bold text-fg">Contexto y cultura</h3>
        <p className="mb-3 mt-0.5 text-sm text-muted">Para presencia del equipo, mentalización del día y tu Recap musical.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SpotifyConnect />
          <GcalConnect />
        </div>
      </div>

      {/* Datos (beta) — backfill Notion → Postgres tras aplicar el esquema 0011 */}
      <div>
        <h3 className="flex items-center gap-2 font-display font-bold text-fg">
          <Database size={16} className="text-accent" /> Datos <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">beta</span>
        </h3>
        <p className="mb-3 mt-0.5 text-sm text-muted">Sincroniza tus clientes, proyectos y tareas de Notion a la base propia (para analítica rápida y futuro SaaS). Aditivo: no cambia nada de tu Notion.</p>
        <SyncButton />
      </div>
    </div>
  );
}

function SyncButton() {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const run = async () => {
    setState("busy"); setMsg("");
    try {
      const r = await fetch("/api/sync", { method: "POST" });
      const d = await r.json();
      if (d.ok) { setState("done"); setMsg(`${d.clients} clientes · ${d.projects} proyectos · ${d.tasks} tareas`); }
      else { setState("error"); setMsg(d.reason || "no se pudo"); }
    } catch (e) { setState("error"); setMsg(String(e)); }
  };
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <button
        onClick={run}
        disabled={state === "busy"}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50 focus-ring"
      >
        {state === "busy" ? <Loader2 size={15} className="animate-spin" /> : state === "done" ? <Check size={15} /> : <RefreshCw size={15} />}
        {state === "busy" ? "Sincronizando…" : "Sincronizar a Postgres"}
      </button>
      {msg && <p className={`mt-2 text-xs ${state === "error" ? "text-rose-500" : "text-curva-teal"}`}>{state === "error" ? `Aún no: ${msg}` : `Listo: ${msg}`}</p>}
      {state === "error" && msg.includes("sin-org") && (
        <p className="mt-1 text-[11px] text-muted">Primero corre <code>supabase/APLICAR-pendientes.sql</code> en Supabase (crea el esquema + la org).</p>
      )}
    </div>
  );
}
