"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, KeyRound, Lock, AtSign } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";

const TEAM_CODE = (process.env.NEXT_PUBLIC_TEAM_CODE || "CURVA").toUpperCase();

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useApp();
  const { members, ready } = useData();

  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // tras autenticar, si falta mapear a un miembro:
  const [needMap, setNeedMap] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [mapErr, setMapErr] = useState("");

  // Fallback sin Supabase: el viejo selector de persona.
  const noBackend = !supabaseConfigured();

  const enterLegacy = (id: string) => { setCurrentUser(id); router.push("/dashboard"); };

  const signIn = async () => {
    setErr("");
    if (team.trim().toUpperCase() !== TEAM_CODE) { setErr("Código de equipo incorrecto"); return; }
    if (!email.trim() || password.length < 6) { setErr("Correo y contraseña (6+) requeridos"); return; }
    const sb = getSupabase();
    if (!sb) { setErr("Backend no configurado"); return; }
    setBusy(true);
    try {
      // crea cuenta si es primera vez (confirmada en servidor) y entra
      await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setErr("Correo o contraseña incorrectos"); return; }
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { setErr("No se pudo iniciar sesión"); return; }
      setUid(u.user.id);
      const { data: prof } = await sb.from("profiles").select("notion_user_id").eq("id", u.user.id).maybeSingle();
      if (prof?.notion_user_id) {
        setCurrentUser(prof.notion_user_id as string);
        router.push("/dashboard");
      } else {
        // cargar personas YA tomadas para no dejar elegirlas
        const { data: claimed } = await sb.from("profiles").select("notion_user_id").not("notion_user_id", "is", null);
        setTaken(new Set((claimed || []).map((c: { notion_user_id: string }) => c.notion_user_id)));
        setNeedMap(true); // primera vez → elegir quién eres
      }
    } finally { setBusy(false); }
  };

  const chooseMember = async (memberId: string, name: string) => {
    setMapErr("");
    const sb = getSupabase();
    if (sb && uid) {
      const { error } = await sb.from("profiles").upsert({ id: uid, name, notion_user_id: memberId, email: email.trim() });
      if (error) {
        // unique violation → alguien la tomó primero
        setMapErr("Esa persona ya fue elegida por otra cuenta. Elige otra.");
        const { data: claimed } = await sb.from("profiles").select("notion_user_id").not("notion_user_id", "is", null);
        setTaken(new Set((claimed || []).map((c: { notion_user_id: string }) => c.notion_user_id)));
        return;
      }
    }
    setCurrentUser(memberId);
    router.push("/dashboard");
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="curva-gradient relative hidden flex-col justify-between p-12 text-white lg:flex">
        <Logo className="text-3xl" />
        <div>
          <h1 className="max-w-md font-display text-4xl font-bold leading-tight">Mide el tiempo. <br /> Decide con datos.</h1>
          <p className="mt-4 max-w-sm text-white/80">Tu espacio de tareas, tiempos y cultura — conectado a tu Notion y tu música.</p>
        </div>
        <p className="text-sm text-white/60">Plataforma del equipo · CURVA</p>
      </section>

      {/* Login */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo className="text-3xl text-ink" /></div>

          {noBackend ? (
            <>
              <h2 className="font-display text-2xl font-bold text-ink">¿Quién eres?</h2>
              <p className="mt-1 text-sm text-zinc-500">Entra con tu usuario.</p>
              <div className="mt-6 space-y-2">
                {!ready && <p className="py-6 text-center text-sm text-zinc-400">Cargando equipo…</p>}
                {members.map((m) => (
                  <button key={m.id} onClick={() => enterLegacy(m.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-curva-purple">
                    <Avatar member={m} size={42} />
                    <span className="min-w-0"><span className="block font-semibold text-ink">{m.name}</span><span className="block truncate text-xs text-zinc-500">{m.role}</span></span>
                  </button>
                ))}
              </div>
            </>
          ) : needMap ? (
            <>
              <h2 className="font-display text-2xl font-bold text-ink">¿Quién eres del equipo?</h2>
              <p className="mt-1 text-sm text-zinc-500">Solo la primera vez — lo recordaremos. Las personas ya tomadas no aparecen.</p>
              {mapErr && <p className="mt-2 text-sm text-rose-500">{mapErr}</p>}
              <div className="mt-6 space-y-2">
                {members.filter((m) => m.name && m.name !== "—" && !taken.has(m.id)).map((m) => (
                  <button key={m.id} onClick={() => chooseMember(m.id, m.name)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-curva-purple">
                    <Avatar member={m} size={42} />
                    <span className="min-w-0"><span className="block font-semibold text-ink">{m.name}</span><span className="block truncate text-xs text-zinc-500">{m.role}</span></span>
                  </button>
                ))}
                {members.filter((m) => m.name && m.name !== "—" && !taken.has(m.id)).length === 0 && (
                  <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-zinc-400">Todas las personas del equipo ya están tomadas.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-ink">Inicia sesión</h2>
              <p className="mt-1 text-sm text-zinc-500">Con el código de tu equipo y tu cuenta.</p>
              <div className="mt-6 space-y-3">
                <Input icon={<KeyRound size={16} />} value={team} onChange={setTeam} placeholder="Código de equipo (ej. CURVA)" />
                <Input icon={<AtSign size={16} />} value={email} onChange={setEmail} placeholder="Tu correo" type="email" />
                <Input icon={<Lock size={16} />} value={password} onChange={setPassword} placeholder="Contraseña (6+)" type="password" onEnter={signIn} />
                {err && <p className="text-sm text-rose-500">{err}</p>}
                <button onClick={signIn} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-curva-purple px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Entrar
                </button>
                <p className="text-center text-[11px] text-zinc-400">Primera vez con tu correo → se crea tu cuenta automáticamente.</p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Input({ icon, value, onChange, placeholder, type = "text", onEnter }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; type?: string; onEnter?: () => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">{icon}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder}
        type={type}
        className="w-full rounded-2xl border border-line bg-white py-3 pl-10 pr-4 text-sm outline-none transition focus:border-curva-purple"
      />
    </div>
  );
}
