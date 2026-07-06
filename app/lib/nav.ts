import { LayoutDashboard, ListTodo, MessageCircle, LineChart, Users, Sparkles, type LucideIcon } from "lucide-react";
import { PILOT } from "@/lib/pilot-flags";

export type NavLink = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };

// UN solo modelo de navegación, con nombres coherentes (el mismo lugar = el mismo
// nombre en nav, sub-tab y título). "Equipo" solo aparece para admins; Recursos y
// Ajustes viven en el menú del avatar (destinos ligeros/ocasionales).
export function navLinks({ isAdmin = false }: { isAdmin?: boolean } = {}): NavLink[] {
  const links: NavLink[] = [
    { href: "/dashboard", label: "Inicio", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
  ];
  if (PILOT.messages) {
    links.push({ href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" });
  }
  links.push({ href: "/insights", label: "Análisis", icon: LineChart, match: (p) => p === "/insights" });
  if (isAdmin) {
    links.push({ href: "/equipo", label: "Equipo", icon: Users, match: (p) => p === "/equipo" });
  }
  links.push({ href: "/momentos", label: "Momentos", icon: Sparkles, match: (p) => p === "/momentos" });
  return links;
}
