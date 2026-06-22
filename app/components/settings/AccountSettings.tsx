"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mail, Briefcase, Users } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

export function AccountSettings() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    if (!sb) return;
    (async () => {
      const { data } = await sb.auth.getUser();
      if (!data.user) return;
      const { data: prof } = await sb.from("profiles").select("avatar_url").eq("id", data.user.id).maybeSingle();
      if (prof?.avatar_url) setPhotoUrl(prof.avatar_url as string);
    })();
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const sb = getSupabase();
    if (!file || !sb) return;
    setUploading(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/avatar-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await sb.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) return;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      await sb.from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
      setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  if (!me) return <p className="text-sm text-zinc-400">Inicia sesión para ver tu cuenta.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-soft">
        <div className="relative">
          <Avatar member={me} src={photoUrl} size={64} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !supabaseConfigured()}
            className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-curva-purple text-white transition hover:opacity-90 disabled:opacity-40 focus-ring"
            aria-label="Cambiar foto"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold text-ink">{me.name}</p>
          <p className="truncate text-sm text-zinc-500">{me.role || "Equipo CURVA"}</p>
        </div>
      </div>

      <div className="divide-y divide-line rounded-2xl border border-line bg-white shadow-soft">
        <Row icon={<Mail size={16} />} label="Correo" value={me.email || "—"} />
        <Row icon={<Briefcase size={16} />} label="Rol" value={me.role || "—"} />
        <Row icon={<Users size={16} />} label="Equipo" value="CURVA" />
      </div>

      <p className="text-xs text-zinc-400">Tu nombre, correo y rol se sincronizan desde Notion (Team Tracker). Para cambiarlos, edítalos ahí.</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="flex items-center gap-2.5 text-sm text-zinc-500">{icon}{label}</span>
      <span className="truncate text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
