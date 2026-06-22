"use client";

import { LineChart, BarChart3, Flame, Sparkles } from "lucide-react";
import { SegmentedNav, type SegTab } from "@/components/SegmentedNav";

// Hub "Análisis": Insights · Reportes · Rachas · Recap (las URLs se conservan).
const tabs: SegTab[] = [
  { href: "/insights", label: "Insights", icon: LineChart },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/rachas", label: "Rachas", icon: Flame },
  { href: "/recap", label: "Recap", icon: Sparkles },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SegmentedNav tabs={tabs} />
      {children}
    </div>
  );
}
