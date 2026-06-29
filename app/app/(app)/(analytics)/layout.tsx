"use client";

import { LineChart, BarChart3, Flame, Sparkles, Camera } from "lucide-react";
import { SegmentedNav, type SegTab } from "@/components/SegmentedNav";
import { useApp } from "@/lib/app-context";

// Sub-nav por rol. Admin: Insights · Reportes · Rachas · Recap (métricas de equipo).
// Miembro: Momentos · Recap · Rachas (su data + lo divertido; nada de equipo).
const ADMIN_TABS: SegTab[] = [
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/rachas", label: "Rachas", icon: Flame },
  { href: "/recap", label: "Recap", icon: Sparkles },
  { href: "/momentos", label: "Momentos", icon: Camera },
];
// Miembro: SU propia data (Insights "Yo" + Recap) + lo divertido (Rachas + Momentos).
const MEMBER_TABS: SegTab[] = [
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/recap", label: "Recap", icon: Sparkles },
  { href: "/rachas", label: "Rachas", icon: Flame },
  { href: "/momentos", label: "Momentos", icon: Camera },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useApp();
  return (
    <div className="space-y-6">
      <SegmentedNav tabs={isAdmin ? ADMIN_TABS : MEMBER_TABS} />
      {children}
    </div>
  );
}
