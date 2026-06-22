"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type SegTab = { href: string; label: string; icon: LucideIcon };

/**
 * Control segmentado de sub-navegación (pills). Marca el activo por ruta.
 * Scroll horizontal en móvil para que nunca se corte.
 */
export function SegmentedNav({ tabs }: { tabs: SegTab[] }) {
  const pathname = usePathname();
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex gap-1 rounded-full border border-line bg-white p-1 shadow-soft">
        {tabs.map((t) => {
          const active = pathname === t.href;
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "focus-ring inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                active ? "bg-ink text-white" : "text-zinc-500 hover:bg-zinc-100",
              )}
            >
              <Icon size={15} /> {t.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
