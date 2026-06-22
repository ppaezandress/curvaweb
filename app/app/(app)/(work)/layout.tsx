"use client";

import { ListTodo, CalendarDays } from "lucide-react";
import { SegmentedNav, type SegTab } from "@/components/SegmentedNav";

// "Tareas" con dos vistas: Lista (gestión) y Semana (grid de horas).
const tabs: SegTab[] = [
  { href: "/tareas", label: "Lista", icon: ListTodo },
  { href: "/timesheet", label: "Semana", icon: CalendarDays },
];

export default function WorkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SegmentedNav tabs={tabs} />
      {children}
    </div>
  );
}
