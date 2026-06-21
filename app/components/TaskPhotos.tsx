"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, Loader2, Trash2, X, SwitchCamera, RotateCcw, Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/Button";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";

type Photo = { id: number; url: string; caption: string | null; user_id: string | null; created_at: string };
type View = "choose" | "camera" | "preview" | "mine";
type Shot = { blob: Blob; url: string; ext: string };

// Foto de una tarea: UNA por persona + comentario opcional.
// Flujo: elegir → (cámara | archivo) → preview con comentario → Guardar.
export function TaskPhotos({ taskId, taskName, open, onClose }: { taskId: string; taskName: string; open: boolean; onClose: () => void }) {
  const sb = getSupabase();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [view, setView] = useState<View>("choose");
  const [shot, setShot] = useState<Shot | null>(null);
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
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

  const stopCam = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const clearShot = useCallback(() => {
    setShot((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
    setCaption("");
  }, []);

  // Al abrir: cargar y definir vista inicial
  useEffect(() => {
    if (!open || !sb) return;
    (async () => {
      const { data } = await sb.auth.getUser();
      const uid = data.user?.id ?? null;
      setMyUid(uid);
      const { data: rows } = await sb.from("task_photos").select("id,url,caption,user_id,created_at").eq("task_id", taskId).order("created_at", { ascending: false });
      const list = (rows as Photo[]) || [];
      setPhotos(list);
      setView(list.some((p) => p.user_id === uid) ? "mine" : "choose");
    })();
  }, [open, sb, taskId]);

  // Al cerrar: limpiar todo
  useEffect(() => { if (!open) { stopCam(); clearShot(); setCamErr(""); } }, [open, stopCam, clearShot]);
  useEffect(() => () => { stopCam(); }, [stopCam]);

  const startCam = useCallback(async (mode: "user" | "environment") => {
    setCamErr("");
    try {
      stopCam();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
      streamRef.current = stream;
      setFacing(mode);
      setView("camera");
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); } }, 40);
    } catch {
      setCamErr("No pude abrir la cámara. Da permiso en el navegador o usa 'Subir archivo'.");
      setView("choose");
    }
  }, [stopCam]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      stopCam();
      setShot({ blob, url: URL.createObjectURL(blob), ext: "jpg" });
      setView("preview");
    }, "image/jpeg", 0.9);
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setShot({ blob: f, url: URL.createObjectURL(f), ext: (f.name.split(".").pop() || "jpg").toLowerCase() });
    setView("preview");
  };

  const pathFromUrl = (url: string) => { const i = url.indexOf("/task-photos/"); return i >= 0 ? url.slice(i + "/task-photos/".length) : null; };

  const removePhoto = useCallback(async (p: Photo) => {
    if (!sb) return;
    const path = pathFromUrl(p.url);
    if (path) await sb.storage.from("task-photos").remove([path]);
    await sb.from("task_photos").delete().eq("id", p.id);
    const next = photos.filter((x) => x.id !== p.id);
    setPhotos(next);
    if (p.user_id === myUid) setView("choose");
  }, [sb, photos, myUid]);

  const save = async () => {
    if (!sb || !shot) return;
    setSaving(true);
    try {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const mine = photos.find((x) => x.user_id === u.user!.id);
      if (mine) await removePhoto(mine);
      const path = `${u.user.id}/${taskId}/${Date.now()}.${shot.ext}`;
      const { error } = await sb.storage.from("task-photos").upload(path, shot.blob, { upsert: true, contentType: shot.blob.type || "image/jpeg" });
      if (error) return;
      const { data: pub } = sb.storage.from("task-photos").getPublicUrl(path);
      await sb.from("task_photos").insert({ task_id: taskId, user_id: u.user.id, url: pub.publicUrl, caption: caption.trim() || null });
      clearShot();
      await load();
      setView("mine");
    } finally { setSaving(false); }
  };

  const myPhoto = photos.find((p) => p.user_id === myUid);
  const others = photos.filter((p) => p.user_id !== myUid);

  return (
    <Modal open={open} onClose={onClose} title="Foto de la tarea">
      <p className="-mt-1 mb-4 truncate text-sm text-zinc-500">{taskName}</p>

      {!supabaseConfigured() ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-zinc-400">Conecta el backend para subir fotos.</p>
      ) : view === "camera" ? (
        // ---- Cámara dedicada (controles superpuestos, look premium) ----
        <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
          <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full object-cover sm:aspect-video" />
          <button onClick={() => { stopCam(); setView("choose"); }} aria-label="Cancelar" className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 focus-ring"><X size={18} /></button>
          <button onClick={() => startCam(facing === "user" ? "environment" : "user")} aria-label="Voltear cámara" className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/60 focus-ring"><SwitchCamera size={18} /></button>
          <div className="absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <button onClick={capture} aria-label="Capturar" className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/30 backdrop-blur transition active:scale-95 focus-ring">
              <span className="h-12 w-12 rounded-full bg-white shadow" />
            </button>
          </div>
        </div>
      ) : view === "preview" && shot ? (
        // ---- Preview + comentario INLINE ----
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.url} alt="Vista previa" className="aspect-[3/4] w-full rounded-2xl object-cover sm:aspect-video" />
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder="Agrega un comentario (opcional)…"
            autoFocus
            className="mt-3 w-full rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-curva-purple"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <button onClick={() => { clearShot(); setView("choose"); }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-100 focus-ring"><RotateCcw size={15} /> Repetir</button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar</Button>
          </div>
        </div>
      ) : view === "mine" && myPhoto ? (
        // ---- Mi foto guardada ----
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={myPhoto.url} alt="" className="aspect-[3/4] w-full rounded-2xl border border-line object-cover sm:aspect-video" />
          {myPhoto.caption && <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-ink">{myPhoto.caption}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => { clearShot(); setView("choose"); }}><Camera size={15} /> Cambiar</Button>
            <Button variant="danger" onClick={() => removePhoto(myPhoto)}><Trash2 size={15} /> Quitar</Button>
          </div>
        </div>
      ) : (
        // ---- Elegir origen ----
        <div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => startCam("environment")} className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-8 text-sm font-medium text-zinc-600 transition hover:border-curva-purple hover:bg-curva-purple/5 hover:text-curva-purple focus-ring"><Camera size={22} /> Tomar foto</button>
            <button onClick={() => fileRef.current?.click()} className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-8 text-sm font-medium text-zinc-600 transition hover:border-curva-purple hover:bg-curva-purple/5 hover:text-curva-purple focus-ring"><Upload size={22} /> Subir archivo</button>
          </div>
          {camErr && <p className="mt-2 text-sm text-rose-500">{camErr}</p>}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {/* Fotos del equipo (una por persona) — no se muestran durante cámara/preview */}
      {others.length > 0 && (view === "choose" || view === "mine") && (
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
