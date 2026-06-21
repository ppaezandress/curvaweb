"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, ImageOff } from "lucide-react";
import { Modal } from "@/components/Modal";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { hhmmFromISO } from "@/lib/format";

type Photo = { id: number; url: string; caption: string | null; user_id: string | null; created_at: string };

// Galería de fotos de una tarea (avances/evidencia), compartida con el equipo.
export function TaskPhotos({ taskId, taskName, open, onClose }: { taskId: string; taskName: string; open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("task_photos").select("id,url,caption,user_id,created_at").eq("task_id", taskId).order("created_at", { ascending: false });
    setPhotos((data as Photo[]) || []);
  }, [sb, taskId]);

  useEffect(() => {
    if (!open || !sb) return;
    (async () => { const { data } = await sb.auth.getUser(); setMyUid(data.user?.id ?? null); })();
    load();
  }, [open, sb, load]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !sb) return;
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${u.user.id}/${taskId}/${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
        const { error } = await sb.storage.from("task-photos").upload(path, file, { upsert: true, contentType: file.type });
        if (error) continue;
        const { data: pub } = sb.storage.from("task-photos").getPublicUrl(path);
        await sb.from("task_photos").insert({ task_id: taskId, user_id: u.user.id, url: pub.publicUrl });
      }
      await load();
    } finally { setUploading(false); }
  };

  const remove = async (p: Photo) => {
    if (!sb) return;
    await sb.from("task_photos").delete().eq("id", p.id);
    setPhotos((cur) => cur.filter((x) => x.id !== p.id));
  };

  return (
    <Modal open={open} onClose={onClose} title="Fotos de la tarea">
      <p className="-mt-1 mb-4 truncate text-sm text-zinc-500">{taskName}</p>

      {!supabaseConfigured() ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-400">Conecta el backend para subir fotos.</p>
      ) : (
        <>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-6 text-sm font-medium text-zinc-500 transition hover:border-curva-purple hover:text-curva-purple focus-ring disabled:opacity-50"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {uploading ? "Subiendo…" : "Subir foto (avance, evidencia, referencia)"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />

          {photos.length === 0 ? (
            <div className="mt-4 flex flex-col items-center gap-2 py-6 text-zinc-300">
              <ImageOff size={28} /><span className="text-sm text-zinc-400">Aún no hay fotos de esta tarea.</span>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <img src={p.url} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                  </a>
                  <span className="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 text-[10px] text-white">{hhmmFromISO(p.created_at)}</span>
                  {p.user_id === myUid && (
                    <button onClick={() => remove(p)} className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition hover:bg-rose-500 group-hover:opacity-100 focus-ring" aria-label="Borrar foto">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
