"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, MessageSquarePlus, Settings, Search, Pin, Bookmark, ChevronRight, FolderOpen, MoreHorizontal, CalendarDays, UploadCloud } from "lucide-react";
import { DUR_BASE, EASE_CURVA } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { Composer, type ComposerHandle } from "@/components/chat/Composer";
import { toast } from "@/lib/toast";
import { MessageItem, type ChatMsg, type ChatProfile, type ReactionAgg, type RsvpAgg } from "@/components/chat/MessageItem";
import { CreateChannelModal } from "@/components/chat/CreateChannelModal";
import { ChannelSettingsModal } from "@/components/chat/ChannelSettingsModal";
import { ChannelFilesModal } from "@/components/chat/ChannelFilesModal";
import { EventModal } from "@/components/chat/EventModal";
import { AgendaModal } from "@/components/chat/AgendaModal";
import { ChatBackground } from "@/components/chat/ChatBackground";
import { SpaceAvatar } from "@/components/chat/SpaceAvatar";
import { CultureRail } from "@/components/chat/CultureRail";
import { hasBackground, type ChatBackground as ChatBg } from "@/lib/chat-backgrounds";
import { cn } from "@/lib/cn";

type Channel = { id: number; name: string; kind: string; created_by: string | null; is_hidden?: boolean; background?: ChatBg | null; topic?: string | null; client_id?: string | null };
type ReactionRow = { id: number; message_id: number; user_id: string; emoji: string };

function daySepLabel(iso: string): string {
  const d = new Date(iso), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Hoy";
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export default function MensajesPage() {
  const { currentUserId, isAdmin, openTasks } = useApp();
  const { members, tasks, clients } = useData();
  const sb = getSupabase();

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, ChatProfile>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [memberships, setMemberships] = useState<{ channel_id: number; user_id: string }[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [reactions, setReactions] = useState<ReactionRow[]>([]);
  const [rsvps, setRsvps] = useState<{ message_id: number; user_id: string; response: string }[]>([]);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [filesCount, setFilesCount] = useState(0);
  const [eventOpen, setEventOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMsg | null>(null);
  const [dragging, setDragging] = useState(false);
  const composerRef = useRef<ComposerHandle>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pins, setPins] = useState<{ message_id: number; channel_id: number }[]>([]);
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState<Set<number>>(new Set());
  const [unreadSince, setUnreadSince] = useState<number>(0);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [showSaved, setShowSaved] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const activeIdRef = useRef<number | null>(null); activeIdRef.current = activeId;
  const readsRef = useRef<Map<number, string>>(new Map());
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
    const { data } = await sb.from("profiles").select("id,name,avatar_url,notion_user_id,email");
    const map: Record<string, ChatProfile> = {};
    (data || []).forEach((p: ChatProfile) => (map[p.id] = p));
    setProfiles(map);
  }, [sb]);

  const loadChannels = useCallback(async () => {
    if (!sb) return;
    const [{ data: chs }, { data: mems }] = await Promise.all([
      sb.from("channels").select("*").order("id"),
      sb.from("channel_members").select("channel_id,user_id"),
    ]);
    setChannels((chs as Channel[]) || []);
    setMemberships((mems as { channel_id: number; user_id: string }[]) || []);
    return (chs as Channel[]) || [];
  }, [sb]);

  const loadPins = useCallback(async () => {
    if (!sb || activeId == null) { setPins([]); return; }
    const { data } = await sb.from("message_pins").select("message_id,channel_id").eq("channel_id", activeId);
    setPins((data as { message_id: number; channel_id: number }[]) || []);
  }, [sb, activeId]);

  const loadFilesCount = useCallback(async () => {
    if (!sb || activeId == null) { setFilesCount(0); return; }
    const { count } = await sb.from("channel_files").select("id", { count: "exact", head: true }).eq("channel_id", activeId);
    setFilesCount(count || 0);
  }, [sb, activeId]);

  // No leídos: compara la última lectura por canal con el último mensaje (de otros).
  const loadUnreads = useCallback(async () => {
    if (!sb || !myUid) return;
    const [{ data: reads }, { data: recent }] = await Promise.all([
      sb.from("channel_reads").select("channel_id,last_read_at").eq("user_id", myUid),
      sb.from("messages").select("channel_id,created_at,user_id").order("created_at", { ascending: false }).limit(500),
    ]);
    const readRows = (reads as { channel_id: number; last_read_at: string }[] | null) || [];
    const recentRows = (recent as { channel_id: number; created_at: string; user_id: string | null }[] | null) || [];
    const readMap = new Map<number, string>();
    readRows.forEach((r) => readMap.set(r.channel_id, r.last_read_at));
    readsRef.current = readMap;
    const lastByCh = new Map<number, { created_at: string; user_id: string | null }>();
    recentRows.forEach((m) => { if (!lastByCh.has(m.channel_id)) lastByCh.set(m.channel_id, m); });
    const uset = new Set<number>();
    lastByCh.forEach((m, chId) => {
      const lr = readMap.get(chId);
      const lrTime = lr ? Date.parse(lr) : 0;
      if (m.user_id !== myUid && Date.parse(m.created_at) > lrTime) uset.add(chId);
    });
    setUnread(uset);
  }, [sb, myUid]);

  const markRead = useCallback(async (chId: number) => {
    if (!sb || !myUid) return;
    setUnread((prev) => { if (!prev.has(chId)) return prev; const n = new Set(prev); n.delete(chId); return n; });
    const now = new Date().toISOString();
    readsRef.current.set(chId, now);
    await sb.from("channel_reads").upsert({ user_id: myUid, channel_id: chId, last_read_at: now }, { onConflict: "user_id,channel_id" });
  }, [sb, myUid]);

  const saveChannelTopic = async (id: number, topic: string) => {
    if (!sb) return;
    await sb.from("channels").update({ topic: topic.trim() || null }).eq("id", id);
    await loadChannels();
  };
  const saveChannelClient = async (id: number, clientId: string | null) => {
    if (!sb) return;
    await sb.from("channels").update({ client_id: clientId }).eq("id", id);
    await loadChannels();
  };

  const loadSaved = useCallback(async () => {
    if (!sb || !myUid) return;
    const { data } = await sb.from("message_saved").select("message_id").eq("user_id", myUid);
    setSaved(new Set(((data as { message_id: number }[]) || []).map((r) => r.message_id)));
  }, [sb, myUid]);

  const toggleSave = async (m: ChatMsg) => {
    if (!sb || !myUid) return;
    const has = saved.has(m.id);
    setSaved((prev) => { const n = new Set(prev); if (has) n.delete(m.id); else n.add(m.id); return n; });
    if (has) await sb.from("message_saved").delete().eq("user_id", myUid).eq("message_id", m.id);
    else await sb.from("message_saved").insert({ user_id: myUid, message_id: m.id });
  };

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
      const { data: msgs } = await sb.from("messages").select("*").eq("channel_id", activeId).order("created_at");
      if (!active) return;
      setMessages((msgs as ChatMsg[]) || []);
      const ids = (msgs || []).map((m: { id: number }) => m.id);
      if (ids.length) {
        const { data: rx } = await sb.from("message_reactions").select("id,message_id,user_id,emoji").in("message_id", ids);
        if (active) setReactions((rx as ReactionRow[]) || []);
        const { data: rv } = await sb.from("message_rsvp").select("message_id,user_id,response").in("message_id", ids);
        if (active) setRsvps((rv as { message_id: number; user_id: string; response: string }[]) || []);
      } else { setReactions([]); setRsvps([]); }
      loadPins();
      loadFilesCount();
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
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${activeId}` },
        (payload: { new: ChatMsg }) => {
          const m = payload.new;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_pins", filter: `channel_id=eq.${activeId}` },
        () => loadPins())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" },
        async () => {
          const { data: msgs } = await sb.from("messages").select("id").eq("channel_id", activeId);
          const ids = (msgs || []).map((m: { id: number }) => m.id);
          if (ids.length) { const { data: rx } = await sb.from("message_reactions").select("id,message_id,user_id,emoji").in("message_id", ids); setReactions((rx as ReactionRow[]) || []); }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_rsvp" },
        async () => {
          const { data: msgs } = await sb.from("messages").select("id").eq("channel_id", activeId);
          const ids = (msgs || []).map((m: { id: number }) => m.id);
          if (ids.length) { const { data: rv } = await sb.from("message_rsvp").select("message_id,user_id,response").in("message_id", ids); setRsvps((rv as { message_id: number; user_id: string; response: string }[]) || []); }
        })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload?: { userId?: string; name?: string } }) => {
        if (!payload?.userId || payload.userId === myUid) return;
        setTyping((t) => ({ ...t, [payload.userId!]: { name: payload.name || "Alguien", ts: Date.now() } }));
      })
      .subscribe();
    chatChanRef.current = sub;
    return () => { active = false; sb.removeChannel(sub); chatChanRef.current = null; };
  }, [sb, activeId, loadProfiles, myUid, loadPins, loadFilesCount]);

  // No leídos: carga inicial + escucha global de mensajes nuevos en otros canales.
  useEffect(() => {
    if (!sb || !myUid) return;
    loadUnreads();
    loadSaved();
    const sub = sb.channel("chat-unreads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload: { new: { channel_id: number; user_id: string | null } }) => {
        const m = payload.new;
        if (!m.user_id || m.user_id === myUid || m.channel_id === activeIdRef.current) return;
        setUnread((prev) => (prev.has(m.channel_id) ? prev : new Set(prev).add(m.channel_id)));
      })
      .subscribe();
    return () => { sb.removeChannel(sub); };
  }, [sb, myUid, loadUnreads, loadSaved]);

  // Al abrir un canal: recuerda hasta dónde habías leído (para el separador) y marca leído.
  useEffect(() => {
    if (activeId == null) return;
    const prev = readsRef.current.get(activeId);
    setUnreadSince(prev ? Date.parse(prev) : 0);
    markRead(activeId);
  }, [activeId, markRead]);

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

  const send = async (body: string, attachment?: { url: string; type: string }) => {
    if (!sb || !myUid || activeId == null) return;
    const row: Record<string, unknown> = { channel_id: activeId, user_id: myUid, body, kind: "user" };
    if (attachment) { row.attachment_url = attachment.url; row.attachment_type = attachment.type; }
    if (replyingTo) row.parent_id = replyingTo.id;
    await sb.from("messages").insert(row);
    setReplyingTo(null);
  };

  const editMessage = async (id: number, body: string) => {
    if (!sb || !body.trim()) return;
    await sb.from("messages").update({ body: body.trim(), edited_at: new Date().toISOString() }).eq("id", id);
    setEditingId(null);
  };
  const deleteMessage = async (id: number) => {
    if (!sb) return;
    await sb.from("messages").update({ deleted_at: new Date().toISOString(), body: "", attachment_url: null, attachment_type: null }).eq("id", id);
  };
  const togglePin = async (m: ChatMsg) => {
    if (!sb || !myUid || activeId == null) return;
    if (pins.some((p) => p.message_id === m.id)) await sb.from("message_pins").delete().eq("message_id", m.id);
    else await sb.from("message_pins").insert({ message_id: m.id, channel_id: activeId, pinned_by: myUid });
  };

  const toggleReaction = async (messageId: number, emoji: string) => {
    if (!sb || !myUid) return;
    const existing = reactions.find((r) => r.message_id === messageId && r.user_id === myUid && r.emoji === emoji);
    if (existing) await sb.from("message_reactions").delete().eq("id", existing.id);
    else await sb.from("message_reactions").insert({ message_id: messageId, user_id: myUid, emoji });
  };

  // RSVP a un mensaje de junta: mismo botón = quitar; otro = cambiar respuesta.
  const setRsvp = async (messageId: number, response: string) => {
    if (!sb || !myUid) return;
    const mine = rsvps.find((r) => r.message_id === messageId && r.user_id === myUid);
    if (mine && mine.response === response) {
      setRsvps((prev) => prev.filter((r) => !(r.message_id === messageId && r.user_id === myUid)));
      await sb.from("message_rsvp").delete().eq("message_id", messageId).eq("user_id", myUid);
    } else {
      setRsvps((prev) => [...prev.filter((r) => !(r.message_id === messageId && r.user_id === myUid)), { message_id: messageId, user_id: myUid, response }]);
      await sb.from("message_rsvp").upsert({ message_id: messageId, user_id: myUid, response }, { onConflict: "message_id,user_id" });
    }
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

  // Admin de canales (creador o admin de la app; RLS lo respalda)
  const renameChannel = async (id: number, name: string) => { if (!sb) return; await sb.from("channels").update({ name }).eq("id", id); await loadChannels(); };
  const setChannelHidden = async (id: number, hidden: boolean) => { if (!sb) return; await sb.from("channels").update({ is_hidden: hidden }).eq("id", id); await loadChannels(); };
  const addChannelMember = async (id: number, uid: string) => { if (!sb) return; await sb.from("channel_members").insert({ channel_id: id, user_id: uid }); await loadChannels(); };
  const removeChannelMember = async (id: number, uid: string) => { if (!sb) return; await sb.from("channel_members").delete().eq("channel_id", id).eq("user_id", uid); await loadChannels(); };
  const saveChannelBackground = async (id: number, bg: ChatBg) => { if (!sb) return; await sb.from("channels").update({ background: bg }).eq("id", id); await loadChannels(); };
  const uploadChannelBg = async (file: File): Promise<string | null> => {
    if (!sb || !myUid) return null;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${myUid}/${activeId ?? "ch"}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("channel-backgrounds").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) return null;
    return sb.storage.from("channel-backgrounds").getPublicUrl(path).data.publicUrl;
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
    if (c.kind === "team") { const n = (c.name || "").trim(); return !n || /^(equipo|team)$/i.test(n) ? "Equipo" : n; }
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

  // RSVP agregado por mensaje: conteos + mi respuesta
  const rsvpFor = useCallback((messageId: number): RsvpAgg => {
    const rs = rsvps.filter((r) => r.message_id === messageId);
    const agg: RsvpAgg = { yes: 0, no: 0, maybe: 0, mine: null };
    rs.forEach((r) => {
      if (r.response === "yes" || r.response === "no" || r.response === "maybe") agg[r.response]++;
      if (r.user_id === myUid) agg.mine = r.response;
    });
    return agg;
  }, [rsvps, myUid]);

  if (authed === false) {
    return <div className="rounded-card border border-dashed border-line p-10 text-center text-sm text-muted">Tu sesión expiró. Vuelve a iniciar sesión para ver los mensajes.</div>;
  }
  if (authed === null) {
    return <div className="rounded-card border border-dashed border-line p-10 text-center text-sm text-muted">Cargando mensajes…</div>;
  }

  // Los canales ocultos solo los ve su creador o un admin (para poder mostrarlos de nuevo).
  const canSeeHidden = (c: Channel) => !c.is_hidden || isAdmin || c.created_by === myUid;
  const teamCh = channels.filter((c) => c.kind === "team" && canSeeHidden(c));
  const customCh = channels.filter((c) => c.kind === "channel" && canSeeHidden(c));
  const dmCh = channels.filter((c) => c.kind === "dm");
  const activeChannel = channels.find((c) => c.id === activeId);
  // Agrupa canales por cliente (de Notion). Sin cliente → "General" (con el canal Equipo).
  const clientNameOf = (id: string | null | undefined) => (id ? clients.find((c) => c.id === id)?.name : undefined);
  const general = [...teamCh, ...customCh.filter((c) => !clientNameOf(c.client_id))];
  const clientGroups = (() => {
    const map = new Map<string, Channel[]>();
    customCh.forEach((c) => { const n = clientNameOf(c.client_id); if (!n) return; if (!map.has(n)) map.set(n, []); map.get(n)!.push(c); });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();
  const toggleCollapse = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const chatHasBg = hasBackground(activeChannel?.background);
  const hasDock = openTasks.length > 0; // el dock (timer activo) ocupa espacio abajo
  const pinnedSet = new Set(pins.map((p) => p.message_id));
  const msgById = new Map(messages.map((m) => [m.id, m]));
  const q = query.trim().toLowerCase();
  const visibleMessages = q
    ? messages.filter((m) => !m.deleted_at && (m.body || "").toLowerCase().includes(q))
    : showSaved
    ? messages.filter((m) => saved.has(m.id) && !m.deleted_at)
    : messages;
  const pinnedMessages = messages.filter((m) => pinnedSet.has(m.id) && !m.deleted_at);
  const replyingProf = replyingTo?.user_id ? profiles[replyingTo.user_id] : undefined;
  const firstUnreadId = unreadSince > 0 && !q
    ? visibleMessages.find((m) => m.user_id !== myUid && Date.parse(m.created_at) > unreadSince)?.id
    : undefined;

  return (
    <div className="flex gap-6">
      {/* Sidebar de espacios — agrupados por cliente */}
      <aside className="hidden w-56 shrink-0 overflow-y-auto lg:block">
        <ChannelList label="General" items={general} activeId={activeId} onSelect={setActiveId} labelOf={channelLabel} renderIcon={renderChannelIcon} emptyText="Sin espacios" unreadIds={unread}
          action={<button onClick={() => setShowNewChannel(true)} className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-accent focus-ring" aria-label="Nuevo espacio"><Plus size={15} /></button>} />

        {clientGroups.map(([name, items]) => (
          <div key={name} className="mt-4">
            <ChannelList label={name} items={items} activeId={activeId} onSelect={setActiveId} labelOf={channelLabel} renderIcon={renderChannelIcon} emptyText="" unreadIds={unread}
              collapsible collapsed={collapsed.has(name)} onToggleCollapse={() => toggleCollapse(name)} />
          </div>
        ))}

        <div className="relative mt-5">
          <ChannelList label="Directos" items={dmCh} activeId={activeId} onSelect={setActiveId} labelOf={channelLabel} renderIcon={renderChannelIcon} emptyText="Sin directos aún" unreadIds={unread}
            action={<button onClick={() => setDmPickerOpen((o) => !o)} className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-accent focus-ring" aria-label="Nuevo directo"><MessageSquarePlus size={15} /></button>} />
          {dmPickerOpen && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-card border border-line bg-[var(--surface-solid)] shadow-float">
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

      {/* Chat — también zona de drop: arrastra un archivo del escritorio y suéltalo aquí */}
      <div
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line/60",
          hasDock ? "h-[calc(100dvh-230px)] lg:h-[calc(100dvh-176px)]" : "h-[calc(100dvh-190px)] lg:h-[calc(100dvh-96px)]",
        )}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); if (!dragging) setDragging(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (!/^(image|video|audio)\//.test(file.type)) {
            toast("Por ahora solo puedes soltar imágenes, videos o audios.", { tone: "error" });
            return;
          }
          composerRef.current?.addFile(file);
        }}
      >
        <ChatBackground bg={activeChannel?.background} />
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-card border-2 border-dashed border-accent bg-accent/10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-accent">
              <UploadCloud size={32} />
              <p className="text-sm font-semibold">Suelta para adjuntar</p>
            </div>
          </div>
        )}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col p-2.5 sm:p-3">
        {/* Selector móvil de espacios */}
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
          {channels.map((c) => (
            <button key={c.id} onClick={() => setActiveId(c.id)} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-sm", c.id === activeId ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface text-fg")}>
              {renderChannelIcon(c, 18)} <span className="font-medium">{channelLabel(c)}</span>
            </button>
          ))}
        </div>

        <div className="mb-2.5 flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-soft">
          {activeChannel && renderChannelIcon(activeChannel, 34)}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display font-bold text-fg">{activeChannel ? channelLabel(activeChannel) : "—"}{activeChannel?.is_hidden && <span className="ml-2 rounded-full bg-warn/10 px-2 py-0.5 align-middle text-caption font-semibold text-warn">oculto</span>}</h1>
            <p className="truncate text-xs text-muted">
              {activeChannel?.topic?.trim()
                ? activeChannel.topic
                : activeChannel?.kind === "team" ? "Todo el equipo · tiempo real"
                : activeChannel?.kind === "dm" ? "Mensaje directo · privado"
                : "Espacio privado · tiempo real"}
            </p>
          </div>
          <div className="relative hidden sm:block">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="w-32 rounded-full border border-line bg-surface-2/60 py-1.5 pl-8 pr-2 text-sm text-fg outline-none transition focus:w-44 focus:border-accent focus-ring" />
          </div>
          <button onClick={() => setFilesOpen(true)} className={cn("relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus-ring", showSaved ? "border-line text-muted hover:border-accent hover:text-accent" : "border-line text-muted hover:border-accent hover:text-accent")} aria-label="Archivos del canal" title="Archivos del canal">
            <FolderOpen size={16} />
            {filesCount > 0 && <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{filesCount}</span>}
          </button>
          {/* Overflow: acciones secundarias del canal */}
          <div className="relative">
            <button onClick={() => setMoreOpen((o) => !o)} className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition focus-ring", moreOpen || showSaved ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:border-accent hover:text-accent")} aria-label="Más opciones" title="Más">
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-card border border-line bg-[var(--surface-solid)] p-1 shadow-float">
                  <button onClick={() => { setAgendaOpen(true); setMoreOpen(false); }} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm text-fg transition hover:bg-surface-2 focus-ring">
                    <CalendarDays size={15} className="text-muted" /> Próximas juntas
                  </button>
                  <button onClick={() => { setShowSaved((s) => !s); setMoreOpen(false); }} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm text-fg transition hover:bg-surface-2 focus-ring">
                    <Bookmark size={15} className={showSaved ? "text-accent" : "text-muted"} fill={showSaved ? "currentColor" : "none"} /> {showSaved ? "Ver todos los mensajes" : "Mensajes guardados"}
                  </button>
                  {activeChannel && activeChannel.kind !== "dm" && (activeChannel.created_by === myUid || isAdmin) && (
                    <button onClick={() => { setSettingsOpen(true); setMoreOpen(false); }} className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm text-fg transition hover:bg-surface-2 focus-ring">
                      <Settings size={15} className="text-muted" /> Ajustes del canal
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Barra de mensajes fijados */}
        {pinnedMessages.length > 0 && !q && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-soft">
            <Pin size={13} className="mt-0.5 shrink-0 text-accent" fill="currentColor" />
            <div className="min-w-0 flex-1 space-y-1">
              {pinnedMessages.slice(-3).map((m) => (
                <button key={m.id} onClick={() => setQuery("")} className="block w-full truncate text-left text-xs text-muted transition hover:text-fg">
                  <b className="text-fg/80">{(m.user_id ? profiles[m.user_id]?.name : "")?.split(" ")[0] || "—"}:</b> {(m.body || "adjunto").replace(/\s+/g, " ").slice(0, 90)}
                </button>
              ))}
            </div>
            <span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-caption font-semibold text-accent">{pinnedMessages.length}</span>
          </div>
        )}

        <div className="flex-1 space-y-0.5 overflow-y-auto px-1 py-1">
          <AnimatePresence initial={false}>
          {visibleMessages.map((m, i) => {
            const prev = i > 0 ? visibleMessages[i - 1] : null;
            const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const grouped = !q && !newDay && !!prev && prev.user_id === m.user_id && prev.kind !== "system" && !prev.deleted_at && !m.parent_id
              && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000);
            const parent = m.parent_id ? msgById.get(m.parent_id) : null;
            return (
              <motion.div key={m.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: DUR_BASE, ease: EASE_CURVA }}>
                {newDay && !q && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-line" />
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-caption font-semibold text-muted">{daySepLabel(m.created_at)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                )}
                {m.id === firstUnreadId && (
                  <div className="my-2 flex items-center gap-3">
                    <span className="h-px flex-1 bg-accent/40" />
                    <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-caption font-semibold text-accent">Nuevos mensajes</span>
                    <span className="h-px flex-1 bg-accent/40" />
                  </div>
                )}
                <MessageItem
                  msg={m} prof={m.user_id ? profiles[m.user_id] : undefined} mine={m.user_id === myUid}
                  reactions={reactionsFor(m.id)} onToggleReaction={toggleReaction} onBg={chatHasBg}
                  rsvp={rsvpFor(m.id)} onRsvp={setRsvp}
                  grouped={grouped} pinned={pinnedSet.has(m.id)} saved={saved.has(m.id)} canModify={m.user_id === myUid} editing={editingId === m.id}
                  parentMsg={parent} parentProf={parent?.user_id ? profiles[parent.user_id] : undefined}
                  onReply={setReplyingTo} onStartEdit={setEditingId} onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={editMessage} onDelete={deleteMessage} onTogglePin={togglePin} onToggleSave={toggleSave}
                />
              </motion.div>
            );
          })}
          </AnimatePresence>
          {visibleMessages.length === 0 && (
            <div className="flex flex-1 items-center justify-center py-10">
              <p className="rounded-full bg-surface px-4 py-2 text-sm text-muted shadow-soft">{q ? "Sin resultados para tu búsqueda." : showSaved ? "No tienes mensajes guardados en este canal." : "Sé el primero en escribir ✨"}</p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Está escribiendo… (en vivo) */}
        {Object.keys(typing).length > 0 && (
          <p className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs italic text-muted shadow-soft">
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-200ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-100ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
            </span>
            {Object.values(typing).map((v) => v.name.split(" ")[0]).join(", ")} {Object.keys(typing).length === 1 ? "está" : "están"} escribiendo…
          </p>
        )}

        <div className="mt-2.5 rounded-2xl border border-line bg-surface px-3 py-2 shadow-soft">
          <Composer ref={composerRef} tasks={tasks} members={members.filter((m) => m.id !== currentUserId && m.name && m.name !== "—")} onSend={send} onTyping={broadcastTyping} chromeless
            replyingTo={replyingTo ? { name: replyingProf?.name || "alguien", preview: (replyingTo.body || "adjunto").replace(/\s+/g, " ").slice(0, 60) } : null}
            onCancelReply={() => setReplyingTo(null)} onEvent={() => setEventOpen(true)} />
        </div>
        </div>
      </div>

      {/* Cultura: buena onda recibida + presencia del equipo */}
      <aside className="hidden w-64 shrink-0 xl:block"><CultureRail /></aside>

      <CreateChannelModal open={showNewChannel} onClose={() => setShowNewChannel(false)} members={teammatesWithAccount} onCreate={createChannel} />

      {activeChannel && (
        <ChannelSettingsModal
          key={activeChannel.id}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          channel={activeChannel}
          currentMembers={memberships.filter((m) => m.channel_id === activeChannel.id).map((m) => profiles[m.user_id]).filter(Boolean)}
          candidates={teammatesWithAccount
            .map((m) => notionToProfile[m.id])
            .filter((p): p is ChatProfile & { notion_user_id?: string } => !!p && !memberships.some((mem) => mem.channel_id === activeChannel.id && mem.user_id === p.id))}
          onRename={(name) => renameChannel(activeChannel.id, name)}
          onToggleHidden={(hidden) => setChannelHidden(activeChannel.id, hidden)}
          onAddMember={(uid) => addChannelMember(activeChannel.id, uid)}
          onRemoveMember={(uid) => removeChannelMember(activeChannel.id, uid)}
          background={activeChannel.background ?? null}
          onSaveBackground={(bg) => saveChannelBackground(activeChannel.id, bg)}
          onUploadImage={uploadChannelBg}
          onSaveTopic={(t) => saveChannelTopic(activeChannel.id, t)}
          clients={clients}
          clientId={activeChannel.client_id ?? null}
          onSaveClient={(cid) => saveChannelClient(activeChannel.id, cid)}
        />
      )}

      {activeChannel && (
        <ChannelFilesModal open={filesOpen} onClose={() => setFilesOpen(false)} channelId={activeChannel.id} myUid={myUid} isAdmin={isAdmin} profiles={profiles} onChange={loadFilesCount} />
      )}

      {activeChannel && (
        <EventModal
          open={eventOpen}
          onClose={() => setEventOpen(false)}
          people={Object.values(profiles).filter((p) => p.email && p.id !== myUid).map((p) => ({ name: p.name, email: p.email as string }))}
          onCreated={(s) => {
            const inv = s.attendees.length ? ` · ${s.attendees.length} invitado${s.attendees.length > 1 ? "s" : ""}` : "";
            send(`📅 **${s.title}** · ${s.whenLabel}${inv}${s.link ? `\n${s.link}` : ""}`);
          }}
          onInstant={(link) => {
            const who = (myUid && profiles[myUid]?.name?.split(" ")[0]) || "Alguien";
            send(`📞 **${who} inició una llamada** · Únete: ${link}`);
          }}
          channelName={activeChannel ? channelLabel(activeChannel) : undefined}
        />
      )}

      <AgendaModal open={agendaOpen} onClose={() => setAgendaOpen(false)} clientName={activeChannel ? clientNameOf(activeChannel.client_id) : undefined} />
    </div>
  );
}

function ChannelList({
  label, items, activeId, onSelect, labelOf, renderIcon, action, emptyText, unreadIds,
  collapsible, collapsed, onToggleCollapse,
}: {
  label: string;
  items: Channel[];
  activeId: number | null;
  onSelect: (id: number) => void;
  labelOf: (c: Channel) => string;
  renderIcon: (c: Channel) => React.ReactNode;
  action?: React.ReactNode;
  emptyText: string;
  unreadIds?: Set<number>;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const hasUnread = !!unreadIds && items.some((c) => unreadIds.has(c.id) && c.id !== activeId);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        {collapsible ? (
          <button onClick={onToggleCollapse} className="flex min-w-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:text-fg focus-ring">
            <ChevronRight size={12} className={cn("shrink-0 transition-transform", !collapsed && "rotate-90")} />
            <span className="truncate">{label}</span>
            {collapsed && hasUnread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
          </button>
        ) : (
          <span className="text-xs font-semibold text-muted">{label}</span>
        )}
        {action}
      </div>
      {(!collapsible || !collapsed) && (
      <div className="space-y-0.5">
        {items.map((c) => {
          const unread = unreadIds?.has(c.id) && c.id !== activeId;
          return (
            <button key={c.id} onClick={() => onSelect(c.id)} className={cn("flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm transition focus-ring", c.id === activeId ? "bg-accent/10 font-semibold text-accent" : unread ? "font-semibold text-fg hover:bg-surface-2" : "text-fg hover:bg-surface-2")}>
              <span className="shrink-0">{renderIcon(c)}</span>
              <span className="truncate flex-1">{labelOf(c)}</span>
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="No leídos" />}
            </button>
          );
        })}
        {items.length === 0 && <p className="px-2 py-1 text-xs text-muted">{emptyText}</p>}
      </div>
      )}
    </div>
  );
}
