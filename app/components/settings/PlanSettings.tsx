"use client";

import { Check, Sparkles } from "lucide-react";

type Plan = {
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  cta: string;
  current?: boolean;
  featured?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    period: "para siempre",
    tagline: "Para empezar a medir solo.",
    features: ["1 persona", "Tareas y cronómetro", "Manual vs IA", "Recap mensual"],
    cta: "Tu plan actual",
    current: true,
  },
  {
    name: "Pro",
    price: "$8",
    period: "por persona / mes",
    tagline: "Para profesionales que trabajan con IA.",
    features: ["Todo lo de Free", "Conectores Claude Code y Desktop", "Insights y aprovechamiento", "Reportes por cliente y cobranza", "Perfil de trabajo"],
    cta: "Próximamente",
    featured: true,
  },
  {
    name: "Equipos",
    price: "$6",
    period: "por persona / mes",
    tagline: "Para empresas que gestionan equipos.",
    features: ["Todo lo de Pro", "Panel de equipo (agregado)", "Funnel por cliente", "Roles y permisos", "Soporte prioritario"],
    cta: "Hablar con ventas",
  },
];

export function PlanSettings() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">El control de tiempo para la era de la IA. Mide a tu equipo y a la IA que trabaja por ellos.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`relative flex flex-col rounded-card border p-5 shadow-soft ${p.featured ? "border-accent bg-accent/[0.03] ring-1 ring-accent/30" : "border-line bg-surface"}`}
          >
            {p.featured && (
              <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-caption font-bold text-white">
                <Sparkles size={11} /> Más popular
              </span>
            )}
            <div className="mb-3">
              <p className="font-display text-lg font-bold text-fg">{p.name}</p>
              <p className="text-xs text-muted">{p.tagline}</p>
            </div>
            <div className="mb-4 flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold text-fg">{p.price}</span>
              <span className="text-xs text-muted">{p.period}</span>
            </div>
            <ul className="mb-5 flex-1 space-y-2">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted">
                  <Check size={15} className={`mt-0.5 shrink-0 ${p.featured ? "text-accent" : "text-success"}`} /> {f}
                </li>
              ))}
            </ul>
            <button
              disabled={p.current}
              className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
                p.current
                  ? "cursor-default border border-line bg-surface-2 text-muted"
                  : p.featured
                    ? "bg-accent text-white hover:opacity-90"
                    : "border border-line bg-surface text-fg hover:border-accent hover:text-accent"
              }`}
            >
              {p.current && <Check size={14} className="mr-1 inline" />}{p.cta}
            </button>
          </div>
        ))}
      </div>
      <p className="text-center text-caption text-muted">Precios de referencia · facturación próximamente</p>
    </div>
  );
}
