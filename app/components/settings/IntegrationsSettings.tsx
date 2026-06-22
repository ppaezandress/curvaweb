"use client";

import { Sparkles } from "lucide-react";
import { ClaudeCodeConnect } from "@/components/ClaudeCodeConnect";
import { ClaudeDesktopConnect } from "@/components/ClaudeDesktopConnect";
import { SpotifyConnect } from "@/components/SpotifyConnect";
import { GcalConnect } from "@/components/GcalConnect";

export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      {/* Captura automática de tiempo de IA */}
      <div>
        <h3 className="flex items-center gap-2 font-display font-bold text-ink">
          <Sparkles size={16} className="text-curva-indigo" /> Captura automática de IA
        </h3>
        <p className="mb-3 mt-0.5 text-sm text-zinc-500">Mide solo el tiempo que la IA trabaja por ti, sin que toques nada.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ClaudeCodeConnect />
          <ClaudeDesktopConnect />
        </div>
      </div>

      {/* Contexto y cultura */}
      <div>
        <h3 className="font-display font-bold text-ink">Contexto y cultura</h3>
        <p className="mb-3 mt-0.5 text-sm text-zinc-500">Para presencia del equipo, mentalización del día y tu Recap musical.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SpotifyConnect />
          <GcalConnect />
        </div>
      </div>
    </div>
  );
}
