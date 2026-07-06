"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { TeamPresence } from "@/components/TeamPresence";

// El chat ES la herramienta de cultura: junto a la presencia del equipo mostramos la
// "buena onda" que te mandaron (kudos). Degrada con gracia si la tabla aún no existe.
function KudosReceived() {
  const [items, setItems] = useState<{ id: number; fromName: string; note: string | null }[]>([]);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      try {
        const { data: u } = await sb.auth.getUser();
        const me = u.user?.id;
        if (!me) return;
        const [{ data: fb }, { data: profs }] = await Promise.all([
          sb.from("peer_feedback").select("id,from_user,note").eq("to_user", me).order("created_at", { ascending: false }).limit(6),
          sb.from("profiles").select("id,name"),
        ]);
        if (!fb) return;
        const pmap: Record<string, string> = {};
        (profs || []).forEach((p: { id: string; name: string }) => (pmap[p.id] = p.name));
        setItems(fb.map((r: { id: number; from_user: string; note: string | null }) => ({ id: r.id, fromName: pmap[r.from_user] || "Alguien", note: r.note })));
      } catch { /* tabla aún no creada — sin buena onda por ahora */ }
    })();
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="rounded-card border border-accent/20 bg-accent/5 p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-accent"><Heart size={13} /> Buena onda</h3>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="text-sm">
            <p className="text-fg"><b>{r.fromName}</b> disfrutó trabajar contigo ✨</p>
            {r.note && <p className="text-xs text-muted">“{r.note}”</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CultureRail() {
  return (
    <div className="space-y-4">
      <KudosReceived />
      <TeamPresence />
    </div>
  );
}
