"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

// Emite presencia (activo/inactivo, tarea, app en foco, canción) cada ~20s
// mientras la app está abierta, y detecta "matches" musicales con el equipo.
export function PresenceHeartbeat() {
  const { active, focusApp, currentUserId } = useApp();
  const { taskById, memberById } = useData();
  const matched = useRef<Set<string>>(new Set()); // anti-spam de matches por sesión

  const activeRef = useRef(active);
  activeRef.current = active;
  const focusRef = useRef(focusApp);
  focusRef.current = focusApp;
  const nameRef = useRef<string>("");
  nameRef.current = (currentUserId && memberById[currentUserId]?.name) || "";

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    let uid: string | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;

    const beat = async () => {
      if (!uid) {
        const { data } = await sb.auth.getUser();
        uid = data.user?.id ?? null;
        if (!uid) return;
      }
      const a = activeRef.current;
      const task = a ? taskById[a.taskId]?.name : undefined;

      // Qué suena (cookie de Spotify de ESTE usuario)
      let track: string | undefined, artist: string | undefined, genres: string[] | undefined;
      try {
        const now = await fetch("/api/spotify/now").then((r) => r.json());
        if (now?.connected && now?.playing && now?.track) {
          track = now.track; artist = now.artist; genres = now.genres || [];
        }
      } catch { /* */ }

      // ¿En junta? (Google Calendar freebusy — solo ocupado/libre, sin títulos)
      let inMeeting = false;
      try {
        const cal = await fetch("/api/gcal/now").then((r) => r.json());
        if (cal?.connected && cal?.busy) inMeeting = true;
      } catch { /* */ }

      const row: Record<string, unknown> = {
        user_id: uid,
        is_active: !!a,
        current_task: task ?? null,
        current_task_id: a?.taskId ?? null, // para detectar co-working (misma tarea exacta)
        app_focus: focusRef.current?.label ?? null,
        focus_tone: focusRef.current?.tone ?? null,
        in_meeting: inMeeting,
        updated_at: new Date().toISOString(),
      };
      // Solo actualizar canción si hay una (conserva la "última")
      if (track) { row.track = track; row.artist = artist; row.genres = genres; }

      await sb.from("presence").upsert(row).then(() => {});
      if (track) {
        sb.from("music_log").insert({ user_id: uid, track, artist, genres, task_id: a?.taskId ?? null }).then(() => {});
        await detectMatch(sb, uid!, artist, track);
      }
    };

    const detectMatch = async (sbc: NonNullable<ReturnType<typeof getSupabase>>, myUid: string, artist?: string, track?: string) => {
      if (!artist) return;
      const since = new Date(Date.now() - 5 * 60000).toISOString();
      const { data } = await sbc
        .from("presence").select("user_id, track, artist")
        .neq("user_id", myUid).gte("updated_at", since);
      for (const p of data || []) {
        const sameArtist = p.artist && artist && p.artist === artist;
        if (!sameArtist) continue;
        const key = `${[myUid, p.user_id].sort().join("|")}:${artist}`;
        if (matched.current.has(key)) continue;
        matched.current.add(key);
        // nombre del otro
        const { data: prof } = await sbc.from("profiles").select("name").eq("id", p.user_id).maybeSingle();
        const sameTrack = p.track && track && p.track === track;
        const { data: ch } = await sbc.from("channels").select("id").eq("name", "equipo").maybeSingle();
        if (ch) {
          const body = sameTrack
            ? `${nameRef.current} y ${prof?.name || "alguien"} están escuchando "${track}" 🎶`
            : `${nameRef.current} y ${prof?.name || "alguien"} están escuchando a ${artist} 🎵`;
          await sbc.from("messages").insert({ channel_id: ch.id, user_id: null, body, kind: "system" });
        }
      }
    };

    beat();
    timer = setInterval(beat, 20000);
    return () => { if (timer) clearInterval(timer); };
  }, [taskById, memberById]);

  return null;
}
