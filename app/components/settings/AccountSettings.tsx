"use client";
import { toast } from "@/lib/toast";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Mail, Briefcase, Users, Sun, Moon, Monitor } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { useTheme, type Theme } from "@/lib/use-theme";
import { Avatar } from "@/components/Avatar";
import { AvatarCropModal } from "@/components/AvatarCropModal";

export function AccountSettings() {
  const { currentUserId } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCropFile(file);
  };

  const uploadBlob = async (blob: Blob) => {
    const sb = getSupabase();
    if (!sb) return;
    setUploading(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const path = `${u.user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) { toast("No se pudo subir la foto: " + error.message, { tone: "error" }); return; }
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error: upErr } = await sb.from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
      if (upErr) { toast("No se pudo guardar la foto en tu perfil: " + upErr.message, { tone: "error" }); return; }
      setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  if (!me) return <p className="text-sm text-muted">Inicia sesión para ver tu cuenta.</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="relative">
          <Avatar member={me} src={photoUrl} size={64} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !supabaseConfigured()}
            className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-accent text-white transition hover:opacity-90 disabled:opacity-40 focus-ring"
            aria-label="Cambiar foto"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold text-fg">{me.name}</p>
          <p className="truncate text-sm text-muted">{me.role || "Equipo CURVA"}</p>
        </div>
      </div>

      <div className="divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
        <Row icon={<Mail size={16} />} label="Correo" value={me.email || "—"} />
        <Row icon={<Briefcase size={16} />} label="Rol" value={me.role || "—"} />
        <Row icon={<Users size={16} />} label="Equipo" value="CURVA" />
      </div>

      <ThemeSelector />

      <p className="text-xs text-muted">Tu nombre, correo y rol se sincronizan desde Notion (Team Tracker). Para cambiarlos, edítalos ahí.</p>
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(blob) => { setCropFile(null); uploadBlob(blob); }}
        />
      )}
    </div>
  );
}

const THEME_OPTIONS: { id: Theme; label: string; icon: React.ReactNode }[] = [
  { id: "light", label: "Claro", icon: <Sun size={15} /> },
  { id: "dark", label: "Oscuro", icon: <Moon size={15} /> },
  { id: "system", label: "Sistema", icon: <Monitor size={15} /> },
];

function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
      <p className="text-sm font-medium text-fg">Apariencia</p>
      <p className="mt-0.5 text-xs text-muted">El tema se guarda en este dispositivo.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {THEME_OPTIONS.map((o) => {
          const on = theme === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setTheme(o.id)}
              role="radio"
              aria-checked={on}
              className={`flex items-center justify-center gap-1.5 rounded-control border px-3 py-2.5 text-sm font-medium transition focus-ring ${
                on
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-surface text-muted hover:border-accent/40 hover:text-fg"
              }`}
            >
              {o.icon} {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5">
      <span className="flex items-center gap-2.5 text-sm text-muted">{icon}{label}</span>
      <span className="truncate text-sm font-medium text-fg">{value}</span>
    </div>
  );
}
