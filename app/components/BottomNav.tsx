"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListTodo, MessageCircle, LineChart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

// 4 destinos directos — sin menú "Más". Cada uno agrupa sus sub-vistas vía `match`.
const tabs: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/dashboard", label: "Hoy", icon: Home, match: (p) => p === "/dashboard" },
  { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" },
  { href: "/insights", label: "Análisis", icon: LineChart, match: (p) => ["/insights", "/reportes", "/rachas", "/recap"].includes(p) },
];

// Navegación inferior — solo en móvil.
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 safe-bottom backdrop-blur sm:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95",
                active ? "text-curva-purple" : "text-zinc-400",
              )}
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
