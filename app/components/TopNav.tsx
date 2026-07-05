"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { navLinks } from "@/lib/nav";
import { Logo } from "@/components/Logo";
import { ProfileMenu } from "@/components/ProfileMenu";

export function TopNav() {
  const pathname = usePathname();
  const { currentUserId, isAdmin, adminResolved } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const links = navLinks({ isAdmin: adminResolved && isAdmin });
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú al navegar o al hacer click afuera.
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <header className="sticky top-0 z-[45] border-b border-line bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Hamburguesa: rellena el hueco 640–768px donde el nav horizontal se oculta. */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              onClick={() => setOpen((o) => !o)}
              className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-fg transition hover:border-accent"
              aria-label="Menú"
              aria-expanded={open}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
            {open && (
              <nav className="absolute left-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-card border border-line bg-surface py-1.5 shadow-float">
                {links.map((l) => {
                  const activeLink = l.match(pathname);
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition ${
                        activeLink ? "bg-ink text-white" : "text-fg hover:bg-surface-2"
                      }`}
                    >
                      <Icon size={16} /> {l.label}
                    </Link>
                  );
                })}
              </nav>
            )}
          </div>

          <Link href="/dashboard" className="text-xl text-fg">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => {
              const activeLink = l.match(pathname);
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`focus-ring inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium transition ${
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
