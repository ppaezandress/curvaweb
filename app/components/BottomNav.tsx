"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/app-context";
import { navLinks } from "@/lib/nav";

// Navegación inferior — solo en móvil. Por rol (admin: Análisis · demás: Momentos).
export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useApp();
  const tabs = navLinks(isAdmin);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 safe-bottom backdrop-blur sm:hidden">
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
                active ? "text-accent" : "text-muted",
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
