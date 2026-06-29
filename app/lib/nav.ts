import { Home, ListTodo, MessageCircle, LineChart, type LucideIcon } from "lucide-react";
import { PILOT } from "@/lib/pilot-flags";

export type NavLink = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

// Mismo destino para todos: Hoy · Tareas · Mensajes · Análisis. La diferencia por rol
// vive DENTRO de Análisis: un miembro ve SU data (insights "Yo" + recap + rachas + momentos);
// un admin ve la del equipo (toggle "Equipo", reportes, dashboard de equipo).
export function navLinks(): NavLink[] {
  const links: NavLink[] = [
    { href: "/dashboard", label: "Hoy", icon: Home, match: (p) => p === "/dashboard" },
    { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
    { href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" },
    { href: "/insights", label: "Análisis", icon: LineChart, match: (p) => ["/insights", "/reportes", "/rachas", "/recap", "/equipo", "/momentos"].includes(p) },
  ];
  return links.filter((l) => PILOT.messages || l.href !== "/mensajes");
}
