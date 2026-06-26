"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListTodo, MessageCircle, LineChart, type LucideIcon } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { PILOT } from "@/lib/pilot-flags";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";

// 4 destinos: Hacer · Organizar · Hablar · Entender.
// `match` decide el estado activo agrupando las sub-rutas de cada destino.
const links: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  { href: "/dashboard", label: "Hoy", icon: Home, match: (p) => p === "/dashboard" },
  { href: "/tareas", label: "Tareas", icon: ListTodo, match: (p) => p === "/tareas" || p === "/timesheet" },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, match: (p) => p === "/mensajes" },
  {
    href: "/insights",
    label: "Análisis",
    icon: LineChart,
    match: (p) => ["/insights", "/reportes", "/rachas", "/recap"].includes(p),
  },
];

export function TopNav() {
  const pathname = usePathname();
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  return (
    <header className="sticky top-0 z-[45] border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl text-fg">
            <Logo />
            <span className="ml-2 align-middle text-xs font-medium text-muted">
              tiempos
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.filter((l) => PILOT.messages || l.href !== "/mensajes").map((l) => {
              const activeLink = l.match(pathname);
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    activeLink
                      ? "bg-ink text-white"
                      : "text-muted hover:bg-surface-2"
                  }`}
                >
                  <Icon size={15} /> {l.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {me && (
          <div className="flex items-center gap-3">
            <p className="hidden text-sm font-semibold leading-tight text-fg sm:block">{me.name}</p>
            <ProfileMenu />
          </div>
        )}
      </div>
    </header>
  );
}
