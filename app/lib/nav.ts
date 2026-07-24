import { LayoutDashboard, ListTodo, CalendarClock, MessageCircle, LineChart, Users, Sparkles, type LucideIcon } from "lucide-react";
import { PILOT } from "@/lib/pilot-flags";

export type NavLink = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

// UN solo modelo de navegación, con nombres coherentes (el mismo lugar = el mismo
// nombre en nav, sub-tab y título). "Equipo" solo aparece para admins; Recursos y
// Ajustes viven en el menú del avatar (destinos ligeros/ocasionales).
export function navLinks({ isAdmin = false }: { isAdmin?: boolean } = {}): NavLink[] {
  const links: NavLink[] = [
    { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
    { href: "/agenda", label: "Agenda", icon: CalendarClock, match: (p) => p === "/agenda" },
  ];
  if (PILOT.messages) {
    links.push({ href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" });
  }
  // "Análisis" agrupa la vista general (/insights) y el análisis del día (/dia) → el sidebar
  // marca "Análisis" en ambas para que sepas en qué área estás.
  links.push({ href: "/insights", label: "Análisis", icon: LineChart, match: (p) => p === "/insights" || p === "/dia" });
  if (isAdmin) {
    links.push({ href: "/equipo", label: "Equipo", icon: Users, match: (p) => p === "/equipo" });
  }
  links.push({ href: "/momentos", label: "Momentos", icon: Sparkles, match: (p) => p === "/momentos" });
  return links;
}
