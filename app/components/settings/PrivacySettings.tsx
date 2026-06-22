"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Download, Trash2, Eye, MonitorSmartphone } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { toCSV, downloadCSV } from "@/lib/export";

type Prefs = { shareProfile: boolean; appFocus: boolean };
const DEFAULTS: Prefs = { shareProfile: false, appFocus: false };

export function PrivacySettings() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const key = currentUserId ? `curva.privacy.${currentUserId}` : "curva.privacy";

  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try { const raw = localStorage.getItem(key); if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) }); } catch { /* */ }
  }, [key]);

  const set = (patch: Partial<Prefs>) => setPrefs((p) => { const n = { ...p, ...patch }; try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* */ } return n; });

  const exportMine = async () => {
    if (!me || busy) return;
    setBusy(true);
    try {
      const d = await fetch("/api/time-entries").then((r) => r.json());
      const mine = (d.records || []).filter((r: { person?: string }) => (r.person || "").trim() === me.name);
      const headers = ["Fecha", "Minutos", "Modo", "Tarea(id)"];
      const rows = mine.map((r: { start?: string; minutes?: number; mode?: string; taskId?: string }) => [r.start?.slice(0, 10) || "", r.minutes ?? 0, r.mode || "manual", r.taskId || ""]);
      downloadCSV(`mis-tiempos-curva.csv`, toCSV(headers, rows));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-curva-teal/30 bg-curva-teal/5 p-4">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-curva-teal" />
        <div>
          <p className="font-semibold text-ink">Esto es para ti, no para vigilarte.</p>
          <p className="mt-0.5 text-sm text-zinc-600">Tu detalle (horarios, tareas, tiempos) <b>solo lo ves tú</b>. El equipo solo ve datos <b>agregados</b>. Nada personal se comparte sin que tú lo actives.</p>
        </div>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-white shadow-soft">
        <Toggle
          icon={<Eye size={16} />}
          label="Compartir mi perfil detallado con el equipo"
          hint="Por defecto, el equipo solo ve totales. Actívalo para compartir tu detalle."
          on={prefs.shareProfile}
          onChange={(v) => set({ shareProfile: v })}
        />
        <Toggle
          icon={<MonitorSmartphone size={16} />}
          label="Permitir captura de foco de apps"
          hint="Para inferir en qué trabajas (app de escritorio). Próximamente."
          on={prefs.appFocus}
          onChange={(v) => set({ appFocus: v })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={exportMine} disabled={busy || !me} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-curva-purple disabled:opacity-40 focus-ring">
          <Download size={15} /> Exportar mis datos (CSV)
        </button>
        <button
          onClick={() => alert("Para borrar tus registros, escríbenos y lo procesamos. (Borrado self-service: próximamente.)")}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-rose-500 transition hover:border-rose-300 focus-ring"
        >
          <Trash2 size={15} /> Borrar mis registros
        </button>
      </div>
      <p className="text-[11px] text-zinc-400">Tus preferencias se guardan en este dispositivo (MVP). Con cuentas de empresa pasarán a tu perfil en la nube.</p>
    </div>
  );
}

function Toggle({ icon, label, hint, on, onChange }: { icon: React.ReactNode; label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 text-zinc-400">{icon}</span>
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      <button
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative h-6 w-11 shrink-0 rounded-full transition focus-ring ${on ? "bg-curva-purple" : "bg-zinc-200"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
