"use client";

import { useEffect, useState } from "react";
import { FolderOpen, Plus, ExternalLink, Trash2, Loader2, Link2 } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { SectionHeader } from "@/components/ui/SectionHeader";

type Resource = { id: string; title: string; url: string; kind: string; added_by: string | null; created_at: string };

// Normaliza la URL (agrega https:// si falta) y saca el host para mostrarlo bonito.
function normalizeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function RecursosPage() {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [available, setAvailable] = useState(true); // false si la tabla aún no existe
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!supabaseConfigured()) { setAvailable(false); setLoading(false); return; }
    const sb = getSupabase();
    if (!sb) { setAvailable(false); setLoading(false); return; }
    const { data: u } = await sb.auth.getUser();
    setUid(u.user?.id ?? null);
    const { data, error } = await sb.from("resources").select("*").order("created_at", { ascending: false });
    if (error) { setAvailable(false); setItems([]); }
    else { setAvailable(true); setItems((data as Resource[]) || []); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const add = async () => {
    const clean = normalizeUrl(url);
    if (!title.trim() || !clean || saving) return;
    const sb = getSupabase();
    if (!sb || !uid) return;
    setSaving(true);
    try {
      const { error } = await sb.from("resources").insert({ title: title.trim(), url: clean, kind: "link", added_by: uid });
      if (error) { alert("No se pudo agregar: " + error.message); return; }
      setTitle(""); setUrl("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const sb = getSupabase();
    if (!sb) return;
    setItems((p) => p.filter((r) => r.id !== id)); // optimista
    const { error } = await sb.from("resources").delete().eq("id", id);
    if (error) { alert("No se pudo borrar: " + error.message); load(); }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Recursos"
        subtitle="El brand book, plantillas y links que el equipo usa seguido — todo en un solo lugar."
      />

      {/* Agregar */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <p className="mb-3 flex items-center gap-2 font-display font-bold text-fg"><Plus size={16} className="text-accent" /> Agregar un recurso</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre (ej. Brand book de Curva)"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus-ring"
          />
          <input
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Link (Notion, Drive, Figma…)"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus-ring"
          />
          <button
            onClick={add}
            disabled={saving || !title.trim() || !url.trim()}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Agregar
          </button>
        </div>
      </section>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando recursos…
        </div>
      ) : !available ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          El espacio de recursos se está preparando. Vuelve en un momento.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Aún no hay recursos. Agrega el primero arriba — el brand book, una plantilla, lo que el equipo use seguido.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:border-accent/40">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Link2 size={18} />
              </span>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg group-hover:text-accent">{r.title}</p>
                <p className="truncate text-xs text-muted">{hostOf(r.url)}</p>
              </a>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full p-2 text-muted transition hover:bg-surface-2 hover:text-accent focus-ring" aria-label="Abrir">
                <ExternalLink size={16} />
              </a>
              {r.added_by === uid && (
                <button onClick={() => remove(r.id)} className="shrink-0 rounded-full p-2 text-muted transition hover:bg-danger/10 hover:text-danger focus-ring" aria-label="Borrar">
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted"><FolderOpen size={12} /> Todos en el equipo ven estos recursos. Puedes borrar los que tú agregaste.</p>
    </div>
  );
}
