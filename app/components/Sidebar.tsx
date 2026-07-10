"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { navLinks } from "@/lib/nav";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

const STORAGE_KEY = "curva.sidebar.collapsed";

/** Barra lateral de navegación (desktop). Se puede colapsar a un riel de iconos.
 *  Solo se monta cuando la app está lista (bajo el loader del layout), así que leer
 *  localStorage en el estado inicial no provoca desajuste de hidratación. */
export function Sidebar({ onNew }: { onNew?: () => void }) {
  const pathname = usePathname();
  const { currentUserId, isAdmin, adminResolved } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const links = navLinks({ isAdmin: adminResolved && isAdmin });

  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1",
  );
  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface backdrop-blur-xl transition-[width] duration-200 ease-[var(--ease-out)] lg:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Cabecera: marca + botón para colapsar/expandir */}
      <div className={cn("flex items-center pb-2 pt-5", collapsed ? "justify-center px-2" : "justify-between px-5")}>
        {!collapsed && (
          <Link href="/dashboard" className="focus-ring inline-flex rounded-md text-xl text-fg">
            <Logo />
          </Link>
        )}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          aria-expanded={!collapsed}
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-control text-muted transition hover:bg-surface-2 hover:text-fg active:scale-[0.96]"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {onNew && (
        <div className={cn("pb-2 pt-3", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <Tooltip content="Nueva tarea" side="right" wrapperClassName="w-full">
              <button
                onClick={onNew}
                aria-label="Nueva tarea"
                className="focus-ring flex h-9 w-full items-center justify-center rounded-control bg-accent text-white transition hover:opacity-95 active:scale-[0.98]"
              >
                <Plus size={18} />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={onNew}
              className="focus-ring flex w-full items-center gap-2 rounded-control bg-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 active:scale-[0.98]"
            >
              <Plus size={17} /> Nueva tarea
            </button>
          )}
        </div>
      )}

      <nav className={cn("flex-1 space-y-0.5 overflow-y-auto py-2", collapsed ? "px-2" : "px-3")}>
        {links.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          const link = (
            <Link
              key={l.href}
              href={l.href}
              aria-label={collapsed ? l.label : undefined}
              className={cn(
                "focus-ring flex items-center rounded-control text-sm font-medium transition",
                collapsed ? "h-10 w-full justify-center" : "gap-3 px-3 py-2",
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 2} />
              {!collapsed && l.label}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={l.href} content={l.label} side="right" wrapperClassName="w-full">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>

      {me && (
        <div className={cn("flex items-center border-t border-line p-3", collapsed ? "justify-center" : "gap-2.5")}>
          <ProfileMenu />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg">{me.name}</p>
              <p className="truncate text-caption text-muted">{me.role}</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
