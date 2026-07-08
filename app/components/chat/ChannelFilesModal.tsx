"use client";

import { useEffect, useState } from "react";
import { File, FileText, Image as ImageIcon, Link2, Upload, Trash2, Plus, ExternalLink, Loader2 } from "lucide-react";
import { Modal, Field, inputCls } from "@/components/Modal";
import { getSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

type ChannelFile = { id: number; channel_id: number; added_by: string | null; name: string; url: string; kind: string; mime: string | null; created_at: string };
type Prof = { name: string; avatar_url: string | null };

function iconFor(f: ChannelFile) {
  if (f.kind === "link") return Link2;
  const n = (f.name + (f.mime || "")).toLowerCase();
  if (/(png|jpe?g|gif|webp|image)/.test(n)) return ImageIcon;
  if (/(pdf|doc|txt|sheet|csv|xls)/.test(n)) return FileText;
  return File;
}

// Biblioteca de archivos importantes de un canal (tipo "Files" de Slack).
// Autónomo: hace sus propias consultas a channel_files + storage.
export function ChannelFilesModal({
  open, onClose, channelId, myUid, isAdmin, profiles, onChange,
}: {
  open: boolean;
  onClose: () => void;
  channelId: number | null;
  myUid: string | null;
  isAdmin: boolean;
  profiles: Record<string, Prof>;
  onChange?: () => void;
}) {
  const [files, setFiles] = useState<ChannelFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");

  const load = async () => {
    const sb = getSupabase();
    if (!sb || channelId == null) return;
    setLoading(true);
    try {
      const { data } = await sb.from("channel_files").select("*").eq("channel_id", channelId).order("created_at", { ascending: false });
      setFiles((data as ChannelFile[]) || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, channelId]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const sb = getSupabase();
    if (!file || !sb || !myUid || channelId == null) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "bin").toLowerCase();
      const path = `${myUid}/${channelId}-${Date.now()}.${ext}`;
      const { error } = await sb.storage.from("channel-files").upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) return;
      const url = sb.storage.from("channel-files").getPublicUrl(path).data.publicUrl;
      await sb.from("channel_files").insert({ channel_id: channelId, added_by: myUid, name: file.name, url, kind: "file", mime: file.type });
      await load(); onChange?.();
    } finally { setUploading(false); }
  };

  const addLink = async () => {
    const sb = getSupabase();
    if (!sb || !myUid || channelId == null || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    await sb.from("channel_files").insert({ channel_id: channelId, added_by: myUid, name: linkName.trim() || url, url, kind: "link" });
    setLinkUrl(""); setLinkName(""); await load(); onChange?.();
  };

  const del = async (f: ChannelFile) => {
    const sb = getSupabase();
    if (!sb) return;
    await sb.from("channel_files").delete().eq("id", f.id);
    if (f.kind === "file") { const p = f.url.split("/channel-files/")[1]; if (p) await sb.storage.from("channel-files").remove([decodeURIComponent(p)]); }
    setFiles((prev) => prev.filter((x) => x.id !== f.id)); onChange?.();
  };

  return (
    <Modal open={open} onClose={onClose} title="Archivos del canal">
      {/* Agregar */}
      <Field label="Agregar">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90", uploading && "opacity-60")}>
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Subiendo…" : "Subir archivo"}
            <input type="file" className="sr-only" onChange={onFile} disabled={uploading} />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Pega un link (Notion, Drive, Figma…)" className={cn(inputCls, "min-w-0 flex-1")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
          <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Nombre (opcional)" className={cn(inputCls, "w-36")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
          <button onClick={addLink} disabled={!linkUrl.trim()} className="inline-flex shrink-0 items-center gap-1 rounded-control border border-line px-3 py-2 text-sm font-semibold text-fg transition hover:border-accent hover:text-accent disabled:opacity-40 focus-ring"><Plus size={14} /> Link</button>
        </div>
      </Field>

      {/* Lista */}
      <div className="mt-1 space-y-1.5">
        {loading && files.length === 0 && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
        {!loading && files.length === 0 && <p className="rounded-card border border-dashed border-line py-8 text-center text-sm text-muted">Aún no hay archivos. Sube documentos o pega links importantes del canal.</p>}
        {files.map((f) => {
          const Icon = iconFor(f);
          const who = f.added_by ? profiles[f.added_by]?.name?.split(" ")[0] : null;
          const canDelete = f.added_by === myUid || isAdmin;
          const date = new Date(f.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
          return (
            <div key={f.id} className="group flex items-center gap-3 rounded-control border border-line px-3 py-2 transition hover:border-accent/40">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Icon size={16} /></span>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-sm font-medium text-fg group-hover:text-accent">{f.name} <ExternalLink size={11} className="shrink-0 opacity-0 transition group-hover:opacity-60" /></span>
                <span className="truncate text-caption text-muted">{f.kind === "link" ? "Link" : "Archivo"}{who ? ` · ${who}` : ""} · {date}</span>
              </a>
              {canDelete && (
                <button onClick={() => del(f)} className="shrink-0 rounded-full p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger focus-ring" aria-label="Quitar" title="Quitar"><Trash2 size={14} /></button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
