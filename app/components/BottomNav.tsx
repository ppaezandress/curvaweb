"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, ListTodo, MessageCircle, BarChart3, MoreHorizontal,
  CalendarDays, Flame, Sparkles, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const primary: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Inicio", icon: Home },
  { href: "/tareas", label: "Tareas", icon: ListTodo },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

const more: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: "/timesheet", label: "Semana", hint: "Tu grid de horas L→D", icon: CalendarDays },
  { href: "/rachas", label: "Rachas", hint: "Tu constancia y el ranking del equipo", icon: Flame },
  { href: "/recap", label: "Recap", hint: "El resumen de tu mes", icon: Sparkles },
];

// Navegación inferior — solo en móvil.
export function BottomNav() {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const moreActive = more.some((m) => pathname === m.href);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 safe-bottom backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {primary.map((l) => {
            const active = pathname === l.href;
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
          <button
            onClick={() => setSheet(true)}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:scale-95",
              moreActive ? "text-curva-purple" : "text-zinc-400",
            )}
          >
            <MoreHorizontal size={20} strokeWidth={moreActive ? 2.4 : 2} />
            Más
          </button>
        </div>
      </nav>

      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm sm:hidden" onClick={() => setSheet(false)}>
          <div className="w-full rounded-t-3xl bg-white p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-ink">Más</h2>
              <button onClick={() => setSheet(false)} className="rounded-full p-1 text-zinc-400 focus-ring" aria-label="Cerrar"><X size={20} /></button>
            </div>
            <div className="space-y-2">
              {more.map((m) => {
                const Icon = m.icon;
                const active = pathname === m.href;
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    onClick={() => setSheet(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-3 transition active:scale-[0.99]",
                      active ? "border-curva-purple bg-curva-purple/5" : "border-line bg-white",
                    )}
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-ink">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{m.label}</span>
                      <span className="block truncate text-xs text-zinc-500">{m.hint}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
