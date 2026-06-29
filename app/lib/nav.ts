import { Home, ListTodo, MessageCircle, LineChart, Sparkles, type LucideIcon } from "lucide-react";
import { PILOT } from "@/lib/pilot-flags";

export type NavLink = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

// Nav por rol. Admin ve "Análisis" (métricas de equipo + dashboard); los demás ven
// "Momentos" (fotos + música + buena onda). Todos: Hoy · Tareas · Mensajes.
export function navLinks(isAdmin: boolean): NavLink[] {
  const base: NavLink[] = [
    { href: "/dashboard", label: "Hoy", icon: Home, match: (p) => p === "/dashboard" },
    { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
    { href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" },
  ];
  const last: NavLink = isAdmin
    ? { href: "/insights", label: "Análisis", icon: LineChart, match: (p) => ["/insights", "/reportes", "/rachas", "/recap", "/equipo"].includes(p) }
    : { href: "/momentos", label: "Momentos", icon: Sparkles, match: (p) => ["/momentos", "/recap", "/rachas"].includes(p) };
  return [...base, last].filter((l) => PILOT.messages || l.href !== "/mensajes");
}
