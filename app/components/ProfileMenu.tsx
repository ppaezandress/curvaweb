"use client";
import { toast } from "@/lib/toast";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Camera, LogOut, Loader2, Settings, FolderOpen, Crop } from "lucide-react";
import { popover } from "@/lib/motion";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Avatar } from "@/components/Avatar";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { cn } from "@/lib/cn";

// Avatar del nav que abre un menú: foto de perfil (subir) + cerrar sesión.
export function ProfileMenu() {
  const { currentUserId, logout } = useApp();
  const { memberById } = useData();
  const me = currentUserId ? memberById[currentUserId] : undefined;

  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropSource, setCropSource] = useState<File | string | null>(null);
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

  // Elegir archivo → abrir el modal de recorte (no subimos crudo).
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir la misma imagen
    if (file) setCropSource(file);
  };

  // Subir la foto YA recortada (cuadrada) que devuelve el modal.
  const uploadBlob = async (blob: Blob) => {
    const sb = getSupabase();
    if (!sb) { toast("No hay conexión para cambiar la foto. Intenta de nuevo en un momento.", { tone: "error" }); return; }
    setUploading(true);
    try {
      const { data: u } = await sb.auth.getUser();
      // En Safari con cookies/rastreo bloqueado la sesión puede no cargar → antes fallaba
      // en silencio ("no me deja"). Ahora avisamos qué hacer (#4).
      if (!u.user) { toast("Tu sesión no está activa. Vuelve a iniciar sesión para cambiar la foto.", { tone: "error" }); return; }
      const path = `${u.user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await sb.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) { toast("No se pudo subir la foto: " + error.message, { tone: "error" }); return; }
      const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: upErr } = await sb.from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
      if (upErr) { toast("No se pudo guardar la foto en tu perfil: " + upErr.message, { tone: "error" }); return; }
      setPhotoUrl(url);
    } finally {
      setUploading(false);
    }
  };

  if (!me) return null;

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => {
          if (!open && boxRef.current) {
            const r = boxRef.current.getBoundingClientRect();
            setDropUp(r.top > window.innerHeight / 2);
            setAlignLeft(r.left < window.innerWidth / 2);
          }
          setOpen((o) => !o);
        }}
        className="rounded-full ring-accent/40 transition hover:ring-2 focus-ring"
        aria-label="Tu perfil"
      >
        <Avatar member={me} src={photoUrl} size={38} />
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          variants={popover}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className={cn(
            "absolute z-50 w-64 overflow-hidden rounded-card border border-line bg-[var(--surface-solid)] shadow-float",
            dropUp ? "bottom-full mb-2" : "mt-2",
            alignLeft ? "left-0" : "right-0",
            dropUp && alignLeft ? "origin-bottom-left" : dropUp ? "origin-bottom-right" : alignLeft ? "origin-top-left" : "origin-top-right",
          )}
        >
          <div className="flex items-center gap-3 border-b border-line p-4">
            <Avatar member={me} src={photoUrl} size={48} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-fg">{me.name}</p>
              <p className="truncate text-xs text-muted">{me.email || me.role}</p>
            </div>
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !supabaseConfigured()}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-muted transition hover:bg-surface-2 disabled:opacity-40"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {uploading ? "Subiendo…" : "Cambiar foto de perfil"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          {photoUrl && (
            <button
              onClick={() => { setOpen(false); setCropSource(photoUrl); }}
              disabled={uploading || !supabaseConfigured()}
              className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-muted transition hover:bg-surface-2 disabled:opacity-40"
            >
              <Crop size={16} /> Ajustar foto actual
            </button>
          )}
          <Link href="/recursos" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-muted transition hover:bg-surface-2">
            <FolderOpen size={16} /> Recursos
          </Link>
          <Link href="/ajustes" onClick={() => setOpen(false)} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-muted transition hover:bg-surface-2">
            <Settings size={16} /> Ajustes
          </Link>
          <button onClick={logout} className="flex w-full items-center gap-2.5 border-t border-line px-4 py-3 text-sm text-danger transition hover:bg-danger/10">
            <LogOut size={16} /> Cerrar sesión
          </button>
        </motion.div>
      )}
      </AnimatePresence>
      {cropSource && (
        <AvatarCropModal
          source={cropSource}
          onCancel={() => setCropSource(null)}
          onConfirm={(blob) => { setCropSource(null); uploadBlob(blob); }}
        />
      )}
    </div>
  );
}
