"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Send, Hash, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

type Msg = { id: number; user_id: string | null; body: string; kind: string; created_at: string };
type Profile = { id: string; name: string; avatar_url: string | null };

function hhmm(s: string) {
  const d = new Date(s);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
function initials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}

export default function MensajesPage() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;
  const sb = getSupabase();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const profilesRef = useRef<Record<string, Profile>>({});
  profilesRef.current = profiles;
  const [text, setText] = useState("");
  const [myUid, setMyUid] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadProfiles = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("profiles").select("id,name,avatar_url");
    const map: Record<string, Profile> = {};
    (data || []).forEach((p: Profile) => (map[p.id] = p));
    setProfiles(map);
  }, [sb]);

  const init = useCallback(async () => {
    if (!sb) { setAuthed(false); return; }
    const { data } = await sb.auth.getUser();
    if (!data.user) { setAuthed(false); return; }
    setMyUid(data.user.id);
    setAuthed(true);
    // canal de equipo
    const { data: ch } = await sb.from("channels").select("id").eq("name", "equipo").maybeSingle();
    if (ch) setChannelId(ch.id);
    await loadProfiles();
  }, [sb, loadProfiles]);

  useEffect(() => { init(); }, [init]);

  // cargar mensajes + realtime
  useEffect(() => {
    if (!sb || !channelId) return;
    let active = true;
    (async () => {
      const { data } = await sb.from("messages").select("*").eq("channel_id", channelId).order("created_at").limit(200);
      if (active) setMessages((data as Msg[]) || []);
    })();
    const sub = sb
      .channel(`msgs-${channelId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload: { new: Msg }) => {
          const msg = payload.new;
          if (msg.user_id && !profilesRef.current[msg.user_id]) loadProfiles();
          setMessages((m) => [...m, msg]);
        })
      .subscribe();
    return () => { active = false; sb.removeChannel(sub); };
  }, [sb, channelId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!sb || !channelId || !text.trim() || !myUid) return;
    const body = text.trim();
    setText("");
    await sb.from("messages").insert({ channel_id: channelId, user_id: myUid, body, kind: "user" });
  };

  if (!supabaseConfigured()) {
    return <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-zinc-400">Mensajes requiere Supabase (aún no configurado).</div>;
  }
  if (authed === null) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400"><Loader2 size={16} className="animate-spin" /> Cargando…</div>;
  }

  if (!authed) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-zinc-400">
        Tu sesión expiró. Vuelve a iniciar sesión para ver los mensajes.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-ink"><Hash size={16} /></span>
        <div>
          <h1 className="font-display font-bold text-ink">equipo</h1>
          <p className="text-xs text-zinc-400">Canal del equipo · tiempo real</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((m) => {
          if (m.kind === "system") {
            return <div key={m.id} className="text-center text-xs text-curva-purple">🎵 {m.body}</div>;
          }
          const prof = m.user_id ? profiles[m.user_id] : undefined;
          const mine = m.user_id === myUid;
          return (
            <div key={m.id} className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-curva-purple/15 text-xs font-bold text-curva-purple">
                {prof?.avatar_url ? <img src={prof.avatar_url} alt="" className="h-full w-full rounded-full object-cover" /> : initials(prof?.name || "?")}
              </span>
              <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                <p className="text-xs text-zinc-400">{prof?.name || "—"} · {hhmm(m.created_at)}</p>
                <div className={`mt-0.5 inline-block rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-curva-purple text-white" : "bg-white text-ink shadow-soft"}`}>{m.body}</div>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">Sé el primero en escribir. 👋</p>}
        <div ref={endRef} />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Escribe un mensaje…" className="flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none focus:border-curva-purple" />
        <button onClick={send} disabled={!text.trim()} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-curva-purple text-white transition hover:opacity-90 disabled:opacity-40"><Send size={16} /></button>
      </div>
    </div>
  );
}
