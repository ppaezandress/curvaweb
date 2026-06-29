"use client";

import { LineChart, BarChart3, Flame, Sparkles, Camera, Users } from "lucide-react";
import { SegmentedNav, type SegTab } from "@/components/SegmentedNav";
import { useApp } from "@/lib/app-context";

// Sub-nav por rol. Admin: Equipo · Insights · Reportes · Rachas · Recap (métricas de equipo).
// Miembro: Insights (su data) · Recap · Rachas · Momentos (su data + lo divertido; nada de equipo).
const ADMIN_TABS: SegTab[] = [
  { href: "/equipo", label: "Equipo", icon: Users },
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
  const { isAdmin, adminResolved } = useApp();
  // Hasta resolver el rol mostramos las tabs de miembro (nunca exponen Reportes) → sin flicker
  // de admin viendo tabs equivocadas ni miembro viendo tabs de admin.
  return (
    <div className="space-y-6">
      <SegmentedNav tabs={adminResolved && isAdmin ? ADMIN_TABS : MEMBER_TABS} />
      {children}
    </div>
  );
}
