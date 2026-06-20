"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListTodo, CalendarDays, BarChart3, type LucideIcon } from "lucide-react";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/tareas", label: "Tareas", icon: ListTodo },
  { href: "/timesheet", label: "Semana", icon: CalendarDays },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

// Barra de navegación inferior — solo en móvil.
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {links.map((l) => {
          const active = pathname === l.href;
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition ${
                active ? "text-curva-purple" : "text-zinc-400"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
