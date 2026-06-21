"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2, Trash2, ImageOff, X, Aperture, SwitchCamera } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { hhmmFromISO } from "@/lib/format";

type Photo = { id: number; url: string; caption: string | null; user_id: string | null; created_at: string };

// Galería de fotos de una tarea (avances/evidencia), compartida con el equipo.
// Permite TOMAR la foto en el momento (webcam) o subir un archivo.
export function TaskPhotos({ taskId, taskName, open, onClose }: { taskId: string; taskName: string; open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
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

  // Apaga la cámara al cerrar el modal
  useEffect(() => { if (!open) stopCam(); }, [open, stopCam]);
  useEffect(() => () => stopCam(), [stopCam]);

  const startCam = useCallback(async (mode: "user" | "environment") => {
    setCamErr("");
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      setCam(true);
      setFacing(mode);
      // esperar a que el <video> exista
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 50);
    } catch {
      setCamErr("No pude abrir la cámara. Revisa los permisos del navegador.");
      setCam(false);
    }
  }, []);

  const uploadBlob = useCallback(async (blob: Blob, ext: string) => {
    if (!sb) return;
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    const path = `${u.user.id}/${taskId}/${Date.now()}-${Math.round(Math.random() * 1e4)}.${ext}`;
    const { error } = await sb.storage.from("task-photos").upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
    if (error) return;
    const { data: pub } = sb.storage.from("task-photos").getPublicUrl(path);
    await sb.from("task_photos").insert({ task_id: taskId, user_id: u.user.id, url: pub.publicUrl });
  }, [sb, taskId]);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) await uploadBlob(file, (file.name.split(".").pop() || "jpg").toLowerCase());
      await load();
    } finally { setUploading(false); }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
    if (!blob) return;
    setUploading(true);
    try { await uploadBlob(blob, "jpg"); await load(); } finally { setUploading(false); }
    // mantiene la cámara abierta por si quieres tomar otra
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
      ) : cam ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-black">
          <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" />
          <div className="flex items-center justify-between gap-2 bg-white p-2">
            <button onClick={() => startCam(facing === "user" ? "environment" : "user")} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-ring" title="Cambiar cámara">
              <SwitchCamera size={16} /> Voltear
            </button>
            <Button onClick={capture} disabled={uploading}>
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Aperture size={16} />} Capturar
            </Button>
            <button onClick={stopCam} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 focus-ring">
              <X size={16} /> Cerrar
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => startCam("environment")} disabled={uploading}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-6 text-sm font-medium text-zinc-500 transition hover:border-curva-purple hover:text-curva-purple focus-ring disabled:opacity-50">
            <Camera size={20} /> Tomar foto
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-6 text-sm font-medium text-zinc-500 transition hover:border-curva-purple hover:text-curva-purple focus-ring disabled:opacity-50">
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />} Subir archivo
          </button>
        </div>
      )}
      {camErr && <p className="mt-2 text-sm text-rose-500">{camErr}</p>}
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
    </Modal>
  );
}
