"use client";

import { useEffect, useState } from "react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// Store minimalista (con listeners, como use-time-records) para saber si hay fotos del
// equipo sin ver. Lo usan el Sidebar (pinta la bolita) y Momentos (marca visto). Degrada
// limpio: si la tabla feed_reads aún no existe en prod, simplemente nunca hay bolita.
let hasNew = false;
let started = false;
const listeners = new Set<(v: boolean) => void>();

function emit() {
  listeners.forEach((l) => l(hasNew));
}
function set(v: boolean) {
  if (v === hasNew) return;
  hasNew = v;
  emit();
}

async function start() {
  if (started || !supabaseConfigured()) return;
  started = true;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const [{ data: last }, { data: latest }] = await Promise.all([
      sb.from("feed_reads").select("last_seen_at").eq("user_id", u.user.id).eq("feed", "photos").maybeSingle(),
      sb.from("task_photos").select("created_at").order("created_at", { ascending: false }).limit(1),
    ]);
    const lastSeen = last?.last_seen_at ? new Date(last.last_seen_at as string).getTime() : 0;
    const newest = latest?.[0]?.created_at ? new Date(latest[0].created_at as string).getTime() : 0;
    if (newest > lastSeen) set(true);
  } catch {
    /* tabla feed_reads no aplicada aún → sin bolita */
  }
  // En vivo: cualquier foto nueva del equipo enciende la bolita.
  sb.channel("new-photos-badge")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "task_photos" }, () => set(true))
    .subscribe();
}

/** Marca el muro de fotos como visto (apaga la bolita y persiste la marca). */
export async function markPhotosSeen() {
  set(false);
  if (!supabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    await sb.from("feed_reads").upsert(
      { user_id: u.user.id, feed: "photos", last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,feed" },
    );
  } catch {
    /* sin tabla → no-op */
  }
}

/** ¿Hay fotos del equipo sin ver? Pinta la bolita en el nav. */
export function useNewPhotos(): boolean {
  const [v, setV] = useState(hasNew);
  useEffect(() => {
    start();
    listeners.add(setV);
    setV(hasNew);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
