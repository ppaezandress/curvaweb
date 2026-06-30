"use client";

import { LineChart, Camera, Users } from "lucide-react";
import { SegmentedNav, type SegTab } from "@/components/SegmentedNav";
import { useApp } from "@/lib/app-context";

// Sub-nav por rol, simple y sin solapes. Tres cubetas: "Mi tiempo" = tu data,
// "Equipo" = la data del equipo (solo admin), "Momentos" = lo divertido/cultural.
const ADMIN_TABS: SegTab[] = [
  { href: "/equipo", label: "Equipo", icon: Users },
  { href: "/insights", label: "Mi tiempo", icon: LineChart },
  { href: "/momentos", label: "Momentos", icon: Camera },
];
const MEMBER_TABS: SegTab[] = [
  { href: "/insights", label: "Mi tiempo", icon: LineChart },
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
