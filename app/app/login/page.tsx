"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, KeyRound, Lock, AtSign, Eye, EyeOff, ArrowRight } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { getSupabase, supabaseConfigured } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";

const TEAM_CODE = (process.env.NEXT_PUBLIC_TEAM_CODE || "CURVA").toUpperCase();
const LS = { team: "curva.login.team", email: "curva.login.email", member: "curva.login.member", name: "curva.login.name" };

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useApp();
  const { members } = useData();

  const [team, setTeam] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // "Bienvenido de nuevo": recordamos quién entró en este dispositivo
  const [remembered, setRemembered] = useState<{ email: string; memberId: string; name: string } | null>(null);
  const [welcomeMode, setWelcomeMode] = useState(true);

  const noBackend = !supabaseConfigured();

  useEffect(() => {
    try {
      const t = localStorage.getItem(LS.team);
      const e = localStorage.getItem(LS.email);
      const m = localStorage.getItem(LS.member);
      const n = localStorage.getItem(LS.name) || "";
      if (t) setTeam(t);
      if (e) setEmail(e);
      if (e && m) setRemembered({ email: e, memberId: m, name: n });
      else setWelcomeMode(false);
    } catch { setWelcomeMode(false); }
  }, []);

  const persist = (memberId: string, name?: string) => {
    try {
      localStorage.setItem(LS.team, team || TEAM_CODE);
      localStorage.setItem(LS.email, email);
      localStorage.setItem(LS.member, memberId);
      if (name) localStorage.setItem(LS.name, name);
    } catch { /* */ }
  };

  const enterLegacy = (id: string) => { setCurrentUser(id); router.push("/dashboard"); };

  const signIn = async () => {
    setErr("");
    const teamVal = (welcomeMode && remembered ? (team || TEAM_CODE) : team).trim().toUpperCase();
    const emailVal = (welcomeMode && remembered ? remembered.email : email).trim().toLowerCase();
    if (teamVal !== TEAM_CODE) { setErr("Código de equipo incorrecto"); return; }
    if (!emailVal || password.length < 6) { setErr("Escribe tu contraseña (6+)"); return; }
    const sb = getSupabase();
    if (!sb) { setErr("Backend no configurado"); return; }
    setBusy(true);
    // La AUTORIZACIÓN (código + correo en roster + mapeo) la hace el SERVIDOR en
    // /api/auth/register. El cliente ya no valida nada (era saltable).
    const callRegister = () =>
      fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password, teamCode: teamVal }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "Sin conexión" }));
    try {
      // 1) Intenta entrar directo (caso de cada día) — no pega a register.
      let { error } = await sb.auth.signInWithPassword({ email: emailVal, password });
      let mappedId: string | undefined;
      let mappedName: string | undefined;
      if (error) {
        // 2) Primer ingreso: el servidor valida y crea/mapea.
        const reg = await callRegister();
        if (!reg.ok) { setErr(reg.error || "No autorizado"); return; }
        mappedId = reg.notionUserId; mappedName = reg.name;
        ({ error } = await sb.auth.signInWithPassword({ email: emailVal, password }));
        if (error) { setErr("Correo o contraseña incorrectos"); return; }
      }
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { setErr("No se pudo iniciar sesión"); return; }
      // 3) ¿Ya está mapeado el perfil?
      if (!mappedId) {
        const { data: prof } = await sb.from("profiles").select("notion_user_id").eq("id", u.user.id).maybeSingle();
        mappedId = (prof?.notion_user_id as string) || undefined;
      }
      // 4) Si aún no, que el servidor lo mapee (valida roster).
      if (!mappedId) {
        const reg = await callRegister();
        if (reg.ok && reg.notionUserId) { mappedId = reg.notionUserId; mappedName = reg.name; }
      }
      if (!mappedId) { setErr("No pudimos mapear tu cuenta. Contacta a tu admin."); return; }
      persist(mappedId, mappedName || remembered?.name);
      setCurrentUser(mappedId);
      router.push("/dashboard");
    } finally { setBusy(false); }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="curva-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Logo mono className="text-3xl text-white" />
        <div className="rise">
          <h1 className="max-w-md font-display text-4xl font-bold leading-tight">Mide el tiempo. <br /> Decide con datos.</h1>
          <p className="mt-4 max-w-sm text-white/80">Tu espacio de tareas, tiempos y cultura — conectado a tu Notion y tu música.</p>
        </div>
        <p className="text-sm text-white/60">Plataforma del equipo · {TEAM_CODE}</p>
      </section>

      {/* Login */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="rise mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo className="text-3xl text-fg" /></div>

          {noBackend ? (
            <Picker title="¿Quién eres?" subtitle="Entra con tu usuario." list={members} onPick={(m) => enterLegacy(m.id)} />
          ) : welcomeMode && remembered ? (
            // ----- Bienvenido de nuevo: solo contraseña -----
            <>
              <h2 className="font-display text-2xl font-bold text-fg">Hola de nuevo</h2>
              <div className="mt-5 flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-soft">
                <Avatar name={remembered.name || remembered.email} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{remembered.name || remembered.email}</p>
                  <p className="truncate text-xs text-muted">{remembered.email}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <PasswordInput value={password} onChange={setPassword} show={showPw} toggle={() => setShowPw((s) => !s)} onEnter={signIn} />
                {err && <p className="text-sm text-danger">{err}</p>}
                <button onClick={signIn} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-card bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Entrar
                </button>
                <button onClick={() => { setWelcomeMode(false); setRemembered(null); setPassword(""); setErr(""); }} className="w-full text-center text-xs text-muted transition hover:text-accent">
                  No soy {(remembered.name || remembered.email).split(/[\s@]/)[0]} · usar otra cuenta
                </button>
              </div>
            </>
          ) : (
            // ----- Login completo -----
            <>
              <h2 className="font-display text-2xl font-bold text-fg">Inicia sesión</h2>
              <p className="mt-1 text-sm text-muted">Con el código de tu equipo y tu cuenta.</p>
              <div className="mt-6 space-y-3">
                <Input icon={<KeyRound size={16} />} value={team} onChange={(v) => setTeam(v)} placeholder="Código de equipo (ej. CURVA)" />
                <Input icon={<AtSign size={16} />} value={email} onChange={setEmail} placeholder="Tu correo" type="email" />
                <PasswordInput value={password} onChange={setPassword} show={showPw} toggle={() => setShowPw((s) => !s)} onEnter={signIn} />
                {err && <p className="text-sm text-danger">{err}</p>}
                <button onClick={signIn} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-card bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Entrar
                </button>
                <p className="text-center text-caption text-muted">Primera vez con tu correo → se crea tu cuenta automáticamente.</p>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function Picker({ title, subtitle, list, onPick }: { title: string; subtitle: string; list: { id: string; name: string; role?: string; color: string; short: string }[]; onPick: (m: { id: string; name: string; role?: string; color: string; short: string }) => void }) {
  return (
    <>
      <h2 className="font-display text-2xl font-bold text-fg">{title}</h2>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
      <div className="mt-6 space-y-2">{list.map((m) => <PickRow key={m.id} m={m} onClick={() => onPick(m)} />)}</div>
    </>
  );
}
function PickRow({ m, onClick }: { m: { name: string; role?: string; color: string; short: string }; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left transition hover:border-accent hover:shadow-sm">
      {/* @ts-expect-error member shape compatible */}
      <Avatar member={m} size={42} />
      <span className="min-w-0"><span className="block font-semibold text-fg">{m.name}</span>{m.role && <span className="block truncate text-xs text-muted">{m.role}</span>}</span>
    </button>
  );
}
function Input({ icon, value, onChange, placeholder, type = "text" }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} aria-label={placeholder}
        className="w-full rounded-card border border-line bg-surface py-3 pl-10 pr-4 text-sm outline-none focus-ring transition focus:border-accent" />
    </div>
  );
}
function PasswordInput({ value, onChange, show, toggle, onEnter }: { value: string; onChange: (v: string) => void; show: boolean; toggle: () => void; onEnter: () => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"><Lock size={16} /></span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
        type={show ? "text" : "password"} placeholder="Contraseña" autoFocus aria-label="Contraseña"
        className="w-full rounded-card border border-line bg-surface py-3 pl-10 pr-11 text-sm outline-none focus-ring transition focus:border-accent" />
      <button type="button" onClick={toggle} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-fg">
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
