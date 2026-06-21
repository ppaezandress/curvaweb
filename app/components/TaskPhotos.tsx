"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2, Trash2, X, Aperture, SwitchCamera, RefreshCw } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

type Photo = { id: number; url: string; caption: string | null; user_id: string | null; created_at: string };

// Foto de una tarea: UNA por persona + comentario opcional. Compartida con el equipo.
export function TaskPhotos({ taskId, taskName, open, onClose }: { taskId: string; taskName: string; open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [cam, setCam] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCam(false);
  }, []);
  useEffect(() => { if (!open) { stopCam(); setCaption(""); } }, [open, stopCam]);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = useCallback(async (mode: "user" | "environment") => {
    setCamErr("");
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      setCam(true); setFacing(mode);
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch {
      setCamErr("No pude abrir la cámara. Da permiso en el navegador o usa 'Subir archivo'.");
      setCam(false);
    }
  }, []);

  // Path de storage desde la URL pública (para borrar el archivo).
  const pathFromUrl = (url: string) => { const i = url.indexOf("/task-photos/"); return i >= 0 ? url.slice(i + "/task-photos/".length) : null; };

  const removePhoto = useCallback(async (p: Photo) => {
    if (!sb) return;
    const path = pathFromUrl(p.url);
    if (path) await sb.storage.from("task-photos").remove([path]);
    await sb.from("task_photos").delete().eq("id", p.id);
    setPhotos((cur) => cur.filter((x) => x.id !== p.id));
  }, [sb]);

  const uploadBlob = useCallback(async (blob: Blob, ext: string) => {
    if (!sb) return;
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    // UNA por persona: borra la mía anterior si existe.
    const mine = photos.find((x) => x.user_id === u.user!.id);
    if (mine) await removePhoto(mine);
    const path = `${u.user.id}/${taskId}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from("task-photos").upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
    if (error) return;
    const { data: pub } = sb.storage.from("task-photos").getPublicUrl(path);
    await sb.from("task_photos").insert({ task_id: taskId, user_id: u.user.id, url: pub.publicUrl, caption: caption.trim() || null });
    await load();
    stopCam();
  }, [sb, taskId, caption, photos, removePhoto, load, stopCam]);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    setUploading(true);
    try { await uploadBlob(files[0], (files[0].name.split(".").pop() || "jpg").toLowerCase()); }
    finally { setUploading(false); }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
    if (!blob) return;
    setUploading(true);
    try { await uploadBlob(blob, "jpg"); } finally { setUploading(false); }
  };

  const myPhoto = photos.find((p) => p.user_id === myUid);
  const others = photos.filter((p) => p.user_id !== myUid);

  return (
    <Modal open={open} onClose={onClose} title="Foto de la tarea">
      <p className="-mt-1 mb-4 truncate text-sm text-zinc-500">{taskName}</p>

      {!supabaseConfigured() ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-400">Conecta el backend para subir fotos.</p>
      ) : cam ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
          <div className="flex items-center justify-between gap-2 bg-white p-2">
            <button onClick={() => startCam(facing === "user" ? "environment" : "user")} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-ring" title="Cambiar cámara"><SwitchCamera size={16} /> Voltear</button>
            <Button onClick={capture} disabled={uploading}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <Aperture size={16} />} Capturar</Button>
            <button onClick={stopCam} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-ring"><X size={16} /> Cancelar</button>
          </div>
        </div>
      ) : myPhoto ? (
        // Ya tengo mi foto → mostrarla + comentario + cambiar/quitar
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={myPhoto.url} alt="" className="aspect-video w-full rounded-2xl border border-line object-cover" />
          {myPhoto.caption && <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-ink">{myPhoto.caption}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => startCam("environment")}><RefreshCw size={15} /> Cambiar</Button>
            <Button variant="danger" onClick={() => removePhoto(myPhoto)}><Trash2 size={15} /> Quitar</Button>
          </div>
        </div>
      ) : (
        // Aún no tengo foto → comentario + tomar/subir
        <div>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Comentario (opcional): ¿qué es esta foto?"
            className="mb-3 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-curva-purple"
          />
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => startCam("environment")} disabled={uploading} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-6 text-sm font-medium text-zinc-500 transition hover:border-curva-purple hover:text-curva-purple focus-ring disabled:opacity-50"><Camera size={20} /> Tomar foto</button>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-6 text-sm font-medium text-zinc-500 transition hover:border-curva-purple hover:text-curva-purple focus-ring disabled:opacity-50">{uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />} Subir archivo</button>
          </div>
          {camErr && <p className="mt-2 text-sm text-rose-500">{camErr}</p>}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {/* Fotos del equipo (una por persona) */}
      {others.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Del equipo</p>
          <div className="grid grid-cols-3 gap-2">
            {others.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-line" title={p.caption || ""}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || ""} className="aspect-square w-full object-cover" />
                {p.caption && <span className="block truncate px-1.5 py-1 text-[11px] text-zinc-500">{p.caption}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
