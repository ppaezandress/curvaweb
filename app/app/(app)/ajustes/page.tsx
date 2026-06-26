"use client";

import { useEffect, useRef, useState } from "react";
import { UserRound, Plug, CreditCard, Shield, type LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { PlanSettings } from "@/components/settings/PlanSettings";
import { PrivacySettings } from "@/components/settings/PrivacySettings";

type TabId = "cuenta" | "integraciones" | "plan" | "privacidad";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "cuenta", label: "Cuenta", icon: UserRound },
  { id: "integraciones", label: "Integraciones", icon: Plug },
  { id: "plan", label: "Plan", icon: CreditCard },
  { id: "privacidad", label: "Privacidad", icon: Shield },
];

export default function AjustesPage() {
  const [tab, setTab] = useState<TabId>("cuenta");
  const btnRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // Mide el tab activo para deslizar el indicador (pill elevado) bajo él.
  useEffect(() => {
    const measure = () => {
      const el = btnRefs.current[tab];
      if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);

  return (
    <div className="space-y-6">
      <SectionHeader title="Ajustes" subtitle="Tu cuenta, integraciones, plan y privacidad." />

      {/* Sub-tabs con indicador deslizante */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative inline-flex gap-1 rounded-full border border-line bg-surface-2 p-1">
          <span
            aria-hidden
            className="absolute bottom-1 top-1 rounded-full bg-surface shadow-soft transition-all duration-300"
            style={{ left: pill.left, width: pill.width, transitionTimingFunction: "var(--ease-curva)" }}
          />
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => { btnRefs.current[t.id] = el; }}
                onClick={() => setTab(t.id)}
                aria-current={on ? "page" : undefined}
                className={`focus-ring relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${on ? "text-fg" : "text-muted hover:text-fg"}`}
              >
                <Icon size={15} className={on ? "text-accent" : ""} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "cuenta" && <AccountSettings />}
      {tab === "integraciones" && <IntegrationsSettings />}
      {tab === "plan" && <PlanSettings />}
      {tab === "privacidad" && <PrivacySettings />}
    </div>
  );
}
