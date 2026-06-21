"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListTodo, CalendarDays, BarChart3, Sparkles, Flame, MessageCircle, type LucideIcon } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";

const links: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/tareas", label: "Tareas", icon: ListTodo },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/timesheet", label: "Semana", icon: CalendarDays },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/rachas", label: "Rachas", icon: Flame },
  { href: "/recap", label: "Recap", icon: Sparkles },
];

export function TopNav() {
  const pathname = usePathname();
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl text-ink">
            <Logo />
            <span className="ml-2 align-middle text-xs font-medium text-zinc-400">
              tiempos
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const activeLink = pathname === l.href;
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    activeLink
                      ? "bg-ink text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
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
            <p className="hidden text-sm font-semibold leading-tight text-ink sm:block">{me.name}</p>
            <ProfileMenu />
          </div>
        )}
      </div>
    </header>
  );
}
