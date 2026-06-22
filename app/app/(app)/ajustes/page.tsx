"use client";

import { useState } from "react";
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

  return (
    <div className="space-y-6">
      <SectionHeader title="Ajustes" subtitle="Tu cuenta, integraciones, plan y privacidad." />

      {/* Sub-tabs */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex gap-1 rounded-full border border-line bg-white p-1 shadow-soft">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${on ? "bg-ink text-white" : "text-zinc-500 hover:bg-zinc-100"}`}
              >
                <Icon size={15} /> {t.label}
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
