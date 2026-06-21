"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LogOut, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";

// Avatar del nav que abre un menú: foto de perfil (subir) + cerrar sesión.
export function ProfileMenu() {
  const { currentUserId, logout } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Cargar foto actual del perfil
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

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sb = getSupabase();
    if (!sb) return;
    setUploading(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/avatar-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
      const { error } = await sb.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) return;
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      await sb.from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
      setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  if (!me) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-full ring-curva-purple/40 transition hover:ring-2">
        {photoUrl ? (
          <img src={photoUrl} alt={me.name} className="h-[38px] w-[38px] rounded-full object-cover" />
        ) : (
          <Avatar member={me} size={38} />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-float">
          <div className="flex items-center gap-3 border-b border-line p-4">
            {photoUrl ? (
              <img src={photoUrl} alt={me.name} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <Avatar member={me} size={48} />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{me.name}</p>
              <p className="truncate text-xs text-zinc-400">{me.email || me.role}</p>
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !supabaseConfigured()}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {uploading ? "Subiendo…" : "Cambiar foto de perfil"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          <button onClick={logout} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-rose-500 transition hover:bg-rose-50">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
