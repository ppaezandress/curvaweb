"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Trophy, ArrowRight } from "lucide-react";
import { listReactions, type Reaction } from "@/lib/reactions";

// Tira de "logros recientes" (reacciones al cerrar tareas) — cultura en la home.
export function AchievementsStrip() {
  const [reactions, setReactions] = useState<Reaction[]>([]);

  useEffect(() => {
    listReactions().then((r) => setReactions(r.slice(0, 8)));
  }, []);

  const items = useMemo(
    () => reactions.map((r) => ({ r, url: r.photo ? URL.createObjectURL(r.photo) : null })),
    [reactions],
  );
  useEffect(() => () => items.forEach((i) => i.url && URL.revokeObjectURL(i.url)), [items]);

  if (reactions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-fg">
          <Trophy size={18} className="text-amber-500" /> Logros recientes
        </h2>
        <Link href="/recap" className="inline-flex items-center gap-1 text-sm font-medium text-accent">
          Ver muro <ArrowRight size={14} />
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {items.map(({ r, url }) => (
          <div key={r.id} className="w-28 shrink-0">
            <div className="relative h-28 w-28 overflow-hidden rounded-2xl border border-line">
              {url ? (
                <img src={url} alt="logro" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-surface-2 text-4xl">{r.emoji}</div>
              )}
              {url && <span className="absolute bottom-1 right-1 text-2xl drop-shadow">{r.emoji}</span>}
            </div>
            <p className="mt-1 truncate text-xs text-muted">{r.taskName}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
