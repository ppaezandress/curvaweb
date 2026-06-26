"use client";

import { useEffect, useState } from "react";
import { Heart, Send, Sparkles } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { formatHours } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

// Kudos de cultura ("buena onda"): tras trabajar juntos (coworking_sessions de la última
// semana), mándale reconocimiento POSITIVO a un compañero. Abajo, lo que TÚ recibiste.
// Nunca se muestra nada negativo ni una matriz para fundadores — solo buena onda.
type Partner = { uid: string; name: string; avatarUrl: string | null; minutes: number };
type Received = { id: number; fromName: string; note: string | null; created_at: string };
type ProfileRow = { id: string; name: string; avatar_url: string | null };

const WEEK_MS = 7 * 86_400_000;
const MIN_SHARED = 30; // minutos juntos para sugerir kudos

export function KudosCard() {
  const [myUid, setMyUid] = useState<string | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [given, setGiven] = useState<Set<string>>(new Set());
  const [received, setReceived] = useState<Received[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data: u } = await sb.auth.getUser();
      const me = u.user?.id;
      if (!me) return;
      setMyUid(me);
      const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();
      const [{ data: sess }, { data: profs }, { data: mine }, { data: recv }] = await Promise.all([
        sb.from("coworking_sessions").select("user_a,user_b,minutes,created_at").gte("created_at", weekAgo),
        sb.from("profiles").select("id,name,avatar_url"),
        sb.from("peer_feedback").select("to_user").eq("from_user", me).gte("created_at", weekAgo),
        sb.from("peer_feedback").select("id,from_user,note,created_at").eq("to_user", me).order("created_at", { ascending: false }).limit(12),
      ]);
      const pmap: Record<string, ProfileRow> = {};
      (profs || []).forEach((p: ProfileRow) => (pmap[p.id] = p));
      const agg = new Map<string, number>();
      (sess || []).forEach((s: { user_a: string; user_b: string; minutes: number }) => {
        const other = s.user_a === me ? s.user_b : s.user_a;
        agg.set(other, (agg.get(other) || 0) + s.minutes);
      });
      setPartners(
        [...agg.entries()]
          .filter(([, min]) => min >= MIN_SHARED)
          .map(([uid, min]) => ({ uid, name: pmap[uid]?.name || "Compañero", avatarUrl: pmap[uid]?.avatar_url || null, minutes: min }))
          .sort((a, b) => b.minutes - a.minutes),
      );
      setGiven(new Set((mine || []).map((m: { to_user: string }) => m.to_user)));
      setReceived(
        (recv || []).map((r: { id: number; from_user: string; note: string | null; created_at: string }) => ({
          id: r.id, fromName: pmap[r.from_user]?.name || "Alguien", note: r.note, created_at: r.created_at,
        })),
      );
    })();
  }, []);

  const send = async (uid: string) => {
    const sb = getSupabase();
    if (!sb || !myUid || sending) return;
    setSending(uid);
    try {
      await sb.from("peer_feedback").insert({ from_user: myUid, to_user: uid, rating: 1, note: note[uid]?.trim() || null });
      setGiven((prev) => new Set(prev).add(uid));
    } finally {
      setSending(null);
    }
  };

  if (!supabaseConfigured()) return null;
  const pending = partners.filter((p) => !given.has(p.uid));
  if (pending.length === 0 && received.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-soft">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold text-fg">
        <Heart size={20} className="text-curva-pink" /> Compañeros de la semana
      </h2>
      <p className="mb-4 text-sm text-muted">Trabajaron la misma tarea a la vez. Mándales buena onda — solo ellos lo verán.</p>

      {pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((p) => (
            <div key={p.uid} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <Avatar name={p.name} src={p.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{p.name}</p>
                <p className="text-xs text-muted">{formatHours(p.minutes * 60)} juntos esta semana</p>
              </div>
              <input
                value={note[p.uid] || ""}
                onChange={(e) => setNote((n) => ({ ...n, [p.uid]: e.target.value }))}
                placeholder="Nota (opcional)"
                maxLength={140}
                className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg placeholder:text-muted focus-ring"
              />
              <button
                onClick={() => send(p.uid)}
                disabled={sending === p.uid}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-curva-pink px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 focus-ring"
              >
                <Send size={14} /> Buena onda
              </button>
            </div>
          ))}
        </div>
      )}

      {received.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
            <Sparkles size={14} className="text-curva-pink" /> Te mandaron buena onda
          </p>
          <div className="space-y-2">
            {received.map((r) => (
              <div key={r.id} className="rounded-xl border border-curva-pink/20 bg-curva-pink/5 px-3 py-2">
                <p className="text-sm text-fg">
                  <b>{r.fromName}</b> disfrutó trabajar contigo ✨
                </p>
                {r.note && <p className="mt-0.5 text-xs text-muted">“{r.note}”</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
