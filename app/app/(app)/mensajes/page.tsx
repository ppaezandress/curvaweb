"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Plus, MessageSquarePlus } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Composer } from "@/components/chat/Composer";
import { MessageItem, type ChatMsg, type ChatProfile, type ReactionAgg } from "@/components/chat/MessageItem";
import { CreateChannelModal } from "@/components/chat/CreateChannelModal";
import { SpaceAvatar } from "@/components/chat/SpaceAvatar";
import { CultureRail } from "@/components/chat/CultureRail";
import { cn } from "@/lib/cn";

type Channel = { id: number; name: string; kind: string; created_by: string | null };
type ReactionRow = { id: number; message_id: number; user_id: string; emoji: string };

function daySepLabel(iso: string): string {
  const d = new Date(iso), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Hoy";
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export default function MensajesPage() {
  const { currentUserId } = useApp();
  const { members, tasks } = useData();
  const sb = getSupabase();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [memberships, setMemberships] = useState<{ channel_id: number; user_id: string }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const profilesRef = useRef(profiles); profilesRef.current = profiles;
  // "Está escribiendo…" en vivo (broadcast, sin tocar la BD).
  const chatChanRef = useRef<ReturnType<NonNullable<typeof sb>["channel"]> | null>(null);
  const [typing, setTyping] = useState<Record<string, { name: string; ts: number }>>({});

  // notion_user_id (member.id) → profile (cuenta). Para crear DMs / canales.
  const notionToProfile = useMemo(() => {
    const map: Record<string, ChatProfile & { notion_user_id?: string }> = {};
    Object.values(profiles).forEach((p) => { const n = (p as ChatProfile & { notion_user_id?: string }).notion_user_id; if (n) map[n] = p; });
    return map;
  }, [profiles]);

  // Compañeros del equipo que YA tienen cuenta (para invitar / DM)
  const teammatesWithAccount = useMemo(
    () => members.filter((m) => m.id !== currentUserId && notionToProfile[m.id]),
    [members, currentUserId, notionToProfile],
  );

  const loadProfiles = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("profiles").select("id,name,avatar_url,notion_user_id");
    const map: Record<string, ChatProfile> = {};
    (data || []).forEach((p: ChatProfile) => (map[p.id] = p));
    setProfiles(map);
  }, [sb]);

  const loadChannels = useCallback(async () => {
    if (!sb) return;
    const [{ data: chs }, { data: mems }] = await Promise.all([
      sb.from("channels").select("id,name,kind,created_by").order("id"),
      sb.from("channel_members").select("channel_id,user_id"),
    ]);
    setChannels((chs as Channel[]) || []);
    setMemberships((mems as { channel_id: number; user_id: string }[]) || []);
    return (chs as Channel[]) || [];
  }, [sb]);

  // Init
  useEffect(() => {
    if (!supabaseConfigured() || !sb) { setAuthed(false); return; }
    (async () => {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { setAuthed(false); return; }
      setMyUid(u.user.id);
      setAuthed(true);
      await loadProfiles();
      const chs = await loadChannels();
      const team = (chs || []).find((c) => c.kind === "team");
      setActiveId((prev) => prev ?? team?.id ?? (chs && chs[0]?.id) ?? null);
    })();
  }, [sb, loadProfiles, loadChannels]);

  // Mensajes + reacciones del canal activo (realtime)
  useEffect(() => {
    if (!sb || activeId == null) return;
    let active = true;
    (async () => {
      const { data: msgs } = await sb.from("messages").select("id,user_id,body,kind,created_at").eq("channel_id", activeId).order("created_at");
      if (!active) return;
      setMessages((msgs as ChatMsg[]) || []);
      const ids = (msgs || []).map((m: { id: number }) => m.id);
      if (ids.length) {
        const { data: rx } = await sb.from("message_reactions").select("id,message_id,user_id,emoji").in("message_id", ids);
        if (active) setReactions((rx as ReactionRow[]) || []);
      } else setReactions([]);
    })();

    setTyping({}); // limpia al cambiar de espacio
    const sub = sb.channel(`chat-${activeId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeId}` },
        (payload: { new: ChatMsg }) => {
          const m = payload.new;
          if (m.user_id && !profilesRef.current[m.user_id]) loadProfiles();
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.user_id) setTyping((t) => { if (!t[m.user_id!]) return t; const n = { ...t }; delete n[m.user_id!]; return n; }); // dejó de escribir
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" },
        async () => {
          const { data: msgs } = await sb.from("messages").select("id").eq("channel_id", activeId);
          const ids = (msgs || []).map((m: { id: number }) => m.id);
          if (ids.length) { const { data: rx } = await sb.from("message_reactions").select("id,message_id,user_id,emoji").in("message_id", ids); setReactions((rx as ReactionRow[]) || []); }
        })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload?: { userId?: string; name?: string } }) => {
        if (!payload?.userId || payload.userId === myUid) return;
        setTyping((t) => ({ ...t, [payload.userId!]: { name: payload.name || "Alguien", ts: Date.now() } }));
      })
      .subscribe();
    chatChanRef.current = sub;
    return () => { active = false; sb.removeChannel(sub); chatChanRef.current = null; };
  }, [sb, activeId, loadProfiles, myUid]);

  // Expira a quien dejó de escribir (>3.5s sin señal).
  useEffect(() => {
    const id = setInterval(() => setTyping((t) => {
      let changed = false; const n = { ...t };
      for (const k in n) if (Date.now() - n[k].ts > 3500) { delete n[k]; changed = true; }
      return changed ? n : t;
    }), 1500);
    return () => clearInterval(id);
  }, []);

  // Avisa que estoy escribiendo (throttle interno en el composer).
  const broadcastTyping = useCallback(() => {
    const ch = chatChanRef.current;
    if (!ch || !myUid) return;
    ch.send({ type: "broadcast", event: "typing", payload: { userId: myUid, name: profilesRef.current[myUid]?.name || "Alguien" } });
  }, [myUid]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (body: string) => {
    if (!sb || !myUid || activeId == null) return;
    await sb.from("messages").insert({ channel_id: activeId, user_id: myUid, body, kind: "user" });
  };

  const toggleReaction = async (messageId: number, emoji: string) => {
    if (!sb || !myUid) return;
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === myUid && r.emoji === emoji);
    if (existing) await sb.from("message_reactions").delete().eq("id", existing.id);
    else await sb.from("message_reactions").insert({ message_id: messageId, user_id: myUid, emoji });
  };

  const createChannel = async (name: string, memberProfileIds: string[]) => {
    if (!sb || !myUid) return;
    const { data: ch } = await sb.from("channels").insert({ name, kind: "channel", created_by: myUid }).select("id").single();
    if (!ch) return;
    const ids = Array.from(new Set([myUid, ...memberProfileIds]));
    await sb.from("channel_members").insert(ids.map((uid) => ({ channel_id: ch.id, user_id: uid })));
    await loadChannels();
    setActiveId(ch.id);
  };

  const startDM = async (otherProfileId: string) => {
    if (!sb || !myUid) return;
    setDmPickerOpen(false);
    // ¿ya existe un DM con esta persona?
    const myDms = channels.filter((c) => c.kind === "dm");
    for (const c of myDms) {
      const set = new Set(memberships.filter((m) => m.channel_id === c.id).map((m) => m.user_id));
      if (set.size === 2 && set.has(myUid) && set.has(otherProfileId)) { setActiveId(c.id); return; }
    }
    const { data: ch } = await sb.from("channels").insert({ name: "dm", kind: "dm", created_by: myUid }).select("id").single();
    if (!ch) return;
    await sb.from("channel_members").insert([{ channel_id: ch.id, user_id: myUid }, { channel_id: ch.id, user_id: otherProfileId }]);
    await loadChannels();
    setActiveId(ch.id);
  };

  // Etiqueta de un espacio (Equipo / DM → nombre del otro)
  const channelLabel = useCallback((c: Channel): string => {
    if (c.kind === "team") return "Equipo";
    if (c.kind === "dm") {
      const other = memberships.find((m) => m.channel_id === c.id && m.user_id !== myUid);
      return other ? (profiles[other.user_id]?.name || "Directo") : "Directo";
    }
    return c.name;
  }, [memberships, myUid, profiles]);

  // Ícono de identidad de un espacio (orbe Equipo · cuadro de color · avatar en DM).
  const renderChannelIcon = (c: Channel, size = 26) => {
    if (c.kind === "dm") {
      const other = memberships.find((m) => m.channel_id === c.id && m.user_id !== myUid);
      const p = other ? profiles[other.user_id] : undefined;
      return <Avatar name={p?.name || "Directo"} src={p?.avatar_url || null} size={size} />;
    }
    return <SpaceAvatar name={channelLabel(c)} kind={c.kind} size={size} />;
  };

  // Reacciones agregadas por mensaje
  const reactionsFor = useCallback((messageId: number): ReactionAgg[] => {
    const rs = reactions.filter((r) => r.message_id === messageId);
    const by: Record<string, ReactionAgg> = {};
    rs.forEach((r) => {
      by[r.emoji] = by[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
      by[r.emoji].count++;
      if (r.user_id === myUid) by[r.emoji].mine = true;
    });
    return Object.values(by);
  }, [reactions, myUid]);

  if (authed === false) {
    return <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Tu sesión expiró. Vuelve a iniciar sesión para ver los mensajes.</div>;
  }
  if (authed === null) {
    return <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Cargando mensajes…</div>;
  }

  const teamCh = channels.filter((c) => c.kind === "team");
  const customCh = channels.filter((c) => c.kind === "channel");
  const dmCh = channels.filter((c) => c.kind === "dm");
  const activeChannel = channels.find((c) => c.id === activeId);

  return (
    <div className="flex gap-6">
      {/* Sidebar de espacios */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <ChannelList label="Espacios" items={[...teamCh, ...customCh]} activeId={activeId} onSelect={setActiveId} labelOf={channelLabel} renderIcon={renderChannelIcon} emptyText="Sin espacios"
          action={<button onClick={() => setShowNewChannel(true)} className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-accent focus-ring" aria-label="Nuevo espacio"><Plus size={15} /></button>} />

        <div className="relative mt-5">
          <ChannelList label="Directos" items={dmCh} activeId={activeId} onSelect={setActiveId} labelOf={channelLabel} renderIcon={renderChannelIcon} emptyText="Sin directos aún"
            action={<button onClick={() => setDmPickerOpen((o) => !o)} className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-accent focus-ring" aria-label="Nuevo directo"><MessageSquarePlus size={15} /></button>} />
          {dmPickerOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
              {teammatesWithAccount.length === 0 && <p className="px-3 py-3 text-xs text-muted">Nadie más tiene cuenta aún.</p>}
              {teammatesWithAccount.map((m) => (
                <button key={m.id} onClick={() => startDM(notionToProfile[m.id].id)} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-2 focus-ring">
                  <Avatar member={m} size={26} /> <span className="truncate text-sm text-fg">{m.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex h-[calc(100vh-200px)] min-w-0 flex-1 flex-col">
        {/* Selector móvil de espacios */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
          {channels.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm", c.id === activeId ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-fg")}>
              {renderChannelIcon(c, 18)} <span className="font-medium">{channelLabel(c)}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 flex items-center gap-2.5 border-b border-line pb-3">
          {activeChannel && renderChannelIcon(activeChannel, 34)}
          <div className="min-w-0">
            <h1 className="truncate font-display font-bold text-fg">{activeChannel ? channelLabel(activeChannel) : "—"}</h1>
            <p className="text-xs text-muted">
              {activeChannel?.kind === "team" ? "Todo el equipo · tiempo real"
                : activeChannel?.kind === "dm" ? "Mensaje directo · privado"
                : "Espacio privado · tiempo real"}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {messages.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            return (
              <div key={m.id} className="space-y-1.5">
                {newDay && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted">{daySepLabel(m.created_at)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                <MessageItem msg={m} prof={m.user_id ? profiles[m.user_id] : undefined} mine={m.user_id === myUid}
                  reactions={reactionsFor(m.id)} onToggleReaction={toggleReaction} />
              </div>
            );
          })}
          {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">Sé el primero en escribir. 👋</p>}
          <div ref={endRef} />
        </div>

        {/* Está escribiendo… (en vivo) */}
        {Object.keys(typing).length > 0 && (
          <p className="flex items-center gap-1.5 px-2 pt-1.5 text-xs italic text-muted">
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-200ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-100ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
            </span>
            {Object.values(typing).map((v) => v.name.split(" ")[0]).join(", ")} {Object.keys(typing).length === 1 ? "está" : "están"} escribiendo…
          </p>
        )}

        <Composer tasks={tasks} members={members.filter((m) => m.id !== currentUserId && m.name && m.name !== "—")} onSend={send} onTyping={broadcastTyping} />
      </div>

      {/* Cultura: buena onda recibida + presencia del equipo */}
      <aside className="hidden w-64 shrink-0 xl:block"><CultureRail /></aside>

      <CreateChannelModal open={showNewChannel} onClose={() => setShowNewChannel(false)} members={teammatesWithAccount} onCreate={createChannel} />
    </div>
  );
}

function ChannelList({
  label, items, activeId, onSelect, labelOf, renderIcon, action, emptyText,
}: {
  label: string;
  items: Channel[];
  activeId: number | null;
  onSelect: (id: number) => void;
  labelOf: (c: Channel) => string;
  renderIcon: (c: Channel) => React.ReactNode;
  action?: React.ReactNode;
  emptyText: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        {action}
      </div>
      <div className="space-y-0.5">
        {items.map((c) => (
          <button key={c.id} onClick={() => onSelect(c.id)} className={cn("flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm transition focus-ring", c.id === activeId ? "bg-accent/10 font-semibold text-accent" : "text-fg hover:bg-surface-2")}>
            <span className="shrink-0">{renderIcon(c)}</span>
            <span className="truncate">{labelOf(c)}</span>
          </button>
        ))}
        {items.length === 0 && <p className="px-2 py-1 text-xs text-muted">{emptyText}</p>}
      </div>
    </div>
  );
}
