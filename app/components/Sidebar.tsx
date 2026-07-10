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
        collapsed ? "w-[76px]" : "w-60",
      )}
    >
      {/* Cabecera: marca + botón para colapsar/expandir */}
      <div
        className={cn(
          "flex items-center pb-3 pt-5",
          collapsed ? "flex-col gap-2 px-0" : "justify-between px-5",
        )}
      >
        {collapsed ? (
          <Link href="/dashboard" aria-label="Inicio" className="focus-ring grid h-10 w-10 place-items-center rounded-control text-lg font-brand font-bold lowercase tracking-tight">
            <span className="text-accent">t</span>
          </Link>
        ) : (
          <Link href="/dashboard" className="focus-ring inline-flex rounded-md text-xl text-fg">
            <Logo />
          </Link>
        )}
        {(() => {
          const btn = (
            <button
              onClick={toggle}
              aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
              aria-expanded={!collapsed}
              className="focus-ring grid h-10 w-10 place-items-center rounded-control text-muted transition hover:bg-surface-2 hover:text-fg active:scale-[0.96]"
            >
              {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={18} />}
            </button>
          );
          return collapsed ? (
            <Tooltip content="Expandir menú" side="right">
              {btn}
            </Tooltip>
          ) : (
            btn
          );
        })()}
      </div>

      {onNew && (
        <div className={cn("pb-2", collapsed ? "flex justify-center px-0" : "px-3")}>
          {collapsed ? (
            <Tooltip content="Nueva tarea" side="right">
              <button
                onClick={onNew}
                aria-label="Nueva tarea"
                className="focus-ring grid h-10 w-10 place-items-center rounded-control bg-accent text-white transition hover:opacity-95 active:scale-[0.96]"
              >
                <Plus size={19} />
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

      <nav
        className={cn(
          "flex-1 overflow-y-auto py-2",
          collapsed ? "flex flex-col items-center gap-1.5 px-0" : "space-y-0.5 px-3",
        )}
      >
        {links.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          const link = (
            <Link
              href={l.href}
              aria-label={collapsed ? l.label : undefined}
              className={cn(
                "focus-ring flex items-center rounded-control font-medium transition",
                collapsed ? "h-11 w-11 justify-center" : "gap-3 px-3 py-2 text-sm",
                active ? "bg-accent/10 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon size={collapsed ? 21 : 18} strokeWidth={active ? 2.4 : 2} />
              {!collapsed && l.label}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={l.href} content={l.label} side="right">
              {link}
            </Tooltip>
          ) : (
            <div key={l.href}>{link}</div>
          );
        })}
      </nav>

      {me && (
        <div className={cn("flex items-center border-t border-line", collapsed ? "justify-center px-0 py-3" : "gap-2.5 p-3")}>
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
