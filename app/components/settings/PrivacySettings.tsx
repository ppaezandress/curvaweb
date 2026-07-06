"use client";
import { toast } from "@/lib/toast";

import { useEffect, useState } from "react";
import { ShieldCheck, Download, Trash2, Eye, MonitorSmartphone, Check, EyeOff } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { toCSV, downloadCSV } from "@/lib/export";
import { Toggle } from "@/components/ui/Toggle";

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
      <div className="flex items-start gap-3 rounded-card border border-success/30 bg-success/5 p-4">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-success" />
        <div>
          <p className="font-semibold text-fg">Esto es para ti, no para vigilarte.</p>
          <p className="mt-0.5 text-sm text-muted">Tu detalle (horarios, tareas, tiempos) <b>solo lo ves tú</b>. El equipo solo ve datos <b>agregados</b>. Nada personal se comparte sin que tú lo actives.</p>
        </div>
      </div>

      {/* Qué ve tu equipo de ti — el muro, en claro. La confianza se enseña, no se promete. */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <p className="font-display font-bold text-fg">Qué ve tu equipo de ti</p>
        <p className="mb-4 mt-0.5 text-sm text-muted">Sin letras chiquitas. Esto es exactamente lo que se expone — y lo que no.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-success"><Check size={13} /> Tu equipo ve</p>
            <ul className="space-y-1.5 text-sm text-fg">
              <WallItem ok>Horas <b>agregadas</b> por cliente y proyecto</WallItem>
              <WallItem ok>Tendencias del equipo (totales, no tu detalle)</WallItem>
              <WallItem ok>Si estás activo o <b>“en junta”</b> (sin el título)</WallItem>
              <WallItem ok>Reconocimientos y rachas que tú decides compartir</WallItem>
            </ul>
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted"><EyeOff size={13} /> Tu equipo NO ve</p>
            <ul className="space-y-1.5 text-sm text-fg">
              <WallItem>En qué tarea estás <b>ahora mismo</b></WallItem>
              <WallItem>Tus <b>sesiones individuales</b> (cada bloque de tiempo)</WallItem>
              <WallItem>Tu detalle hora por hora, ni tu ritmo personal</WallItem>
              <WallItem>Tu música ni los títulos de tus juntas</WallItem>
            </ul>
          </div>
        </div>
        <p className="mt-4 text-caption text-muted">No es una promesa de copy: tu data cruda es <b>dueño-solo</b> por diseño (RLS). Ni el equipo ni un manager pueden leerla, aunque lo intenten por la API.</p>
      </div>

      <div className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
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
        <button onClick={exportMine} disabled={busy || !me} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent disabled:opacity-40 focus-ring">
          <Download size={15} /> Exportar mis datos (CSV)
        </button>
        <button
          onClick={() => toast("Para borrar tus registros, escríbenos y lo procesamos. (Borrado self-service: próximamente.)")}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-danger transition hover:border-danger/40 focus-ring"
        >
          <Trash2 size={15} /> Borrar mis registros
        </button>
      </div>
      <p className="text-caption text-muted">Tus preferencias se guardan en este dispositivo (MVP). Con cuentas de empresa pasarán a tu perfil en la nube.</p>
    </div>
  );
}

function WallItem({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>
        {ok ? <Check size={11} /> : <EyeOff size={10} />}
      </span>
      <span className="text-muted">{children}</span>
    </li>
  );
}
