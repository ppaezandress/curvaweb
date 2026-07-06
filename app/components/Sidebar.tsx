"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { navLinks } from "@/lib/nav";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";
import { cn } from "@/lib/cn";

/** Barra lateral de navegación (desktop). Da la sensación de app, no de web. */
export function Sidebar({ onNew }: { onNew?: () => void }) {
  const pathname = usePathname();
  const { currentUserId, isAdmin, adminResolved } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const links = navLinks({ isAdmin: adminResolved && isAdmin });

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 pb-2 pt-5">
        <Link href="/dashboard" className="text-xl text-fg focus-ring inline-flex rounded-md">
          <Logo />
        </Link>
      </div>

      {onNew && (
        <div className="px-3 pb-2 pt-3">
          <button
            onClick={onNew}
            className="focus-ring flex w-full items-center gap-2 rounded-control bg-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 active:scale-[0.98]"
          >
            <Plus size={17} /> Nueva tarea
          </button>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {links.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "focus-ring flex items-center gap-3 rounded-control px-3 py-2 text-sm font-medium transition",
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {l.label}
            </Link>
          );
        })}
      </nav>

      {me && (
        <div className="flex items-center gap-2.5 border-t border-line p-3">
          <ProfileMenu />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{me.name}</p>
            <p className="truncate text-caption text-muted">{me.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
