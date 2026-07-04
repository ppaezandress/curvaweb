"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, KeyRound, AtSign, ArrowRight, MailCheck } from "lucide-react";
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
  const [code, setCode] = useState("");
  // Flujo en dos pasos: pides un código a tu correo y luego lo escribes. Sin contraseña →
  // solo el dueño del correo puede entrar (cierra la toma de cuenta por pre-registro).
  const [step, setStep] = useState<"request" | "verify">("request");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  // "Bienvenido de nuevo": recordamos quién entró en este dispositivo.
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

  // Paso 1 — pedir el código: el SERVIDOR valida (código de equipo + correo en roster y
  // asegura la cuenta), luego Supabase envía un código de un solo uso al correo.
  const requestCode = async () => {
    setErr(""); setNote("");
    const teamVal = (welcomeMode && remembered ? (team || TEAM_CODE) : team).trim().toUpperCase();
    const emailVal = (welcomeMode && remembered ? remembered.email : email).trim().toLowerCase();
    if (teamVal !== TEAM_CODE) { setErr("Código de equipo incorrecto"); return; }
    if (!emailVal || !emailVal.includes("@")) { setErr("Escribe un correo válido"); return; }
    const sb = getSupabase();
    if (!sb) { setErr("Backend no configurado"); return; }
    setBusy(true);
    try {
      const reg = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, teamCode: teamVal }),
      }).then((r) => r.json()).catch(() => ({ ok: false, error: "Sin conexión" }));
      if (!reg.ok) { setErr(reg.error || "No autorizado"); return; }
      const { error } = await sb.auth.signInWithOtp({ email: emailVal, options: { shouldCreateUser: false } });
      if (error) { setErr("No se pudo enviar el código. Reintenta en un momento."); return; }
      setEmail(emailVal);
      setStep("verify");
      setNote(`Te enviamos un código a ${emailVal}. Revisa tu correo (y spam).`);
    } finally { setBusy(false); }
  };

  // Paso 2 — verificar el código y entrar.
  const verifyCode = async () => {
    setErr("");
    const token = code.trim();
    if (token.length < 6) { setErr("Escribe el código de 6 dígitos"); return; }
    const sb = getSupabase();
    if (!sb) { setErr("Backend no configurado"); return; }
    setBusy(true);
    try {
      const emailVal = email.trim().toLowerCase();
      const { error } = await sb.auth.verifyOtp({ email: emailVal, token, type: "email" });
      if (error) { setErr("Código incorrecto o vencido. Pide uno nuevo."); return; }
      const { data: u } = await sb.auth.getUser();
      if (!u.user) { setErr("No se pudo iniciar sesión"); return; }
      // El perfil (con notion_user_id) ya lo dejó listo el servidor al pedir el código.
      const { data: prof } = await sb.from("profiles").select("notion_user_id, name").eq("id", u.user.id).maybeSingle();
      const mappedId = (prof?.notion_user_id as string) || undefined;
      if (!mappedId) { setErr("No pudimos mapear tu cuenta. Contacta a tu admin."); return; }
      persist(mappedId, (prof?.name as string) || remembered?.name);
      setCurrentUser(mappedId);
      router.push("/dashboard");
    } finally { setBusy(false); }
  };

  const resetToRequest = () => { setStep("request"); setCode(""); setErr(""); setNote(""); };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="curva-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Logo className="text-3xl" />
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
          ) : step === "verify" ? (
            // ----- Paso 2: escribe el código del correo -----
            <>
              <h2 className="font-display text-2xl font-bold text-fg">Revisa tu correo 📬</h2>
              {note && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MailCheck size={15} className="text-success" /> {note}</p>}
              <div className="mt-6 space-y-3">
                <CodeInput value={code} onChange={setCode} onEnter={verifyCode} />
                {err && <p className="text-sm text-danger">{err}</p>}
                <button onClick={verifyCode} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Entrar
                </button>
                <div className="flex items-center justify-between text-xs text-muted">
                  <button onClick={requestCode} disabled={busy} className="transition hover:text-fg">Reenviar código</button>
                  <button onClick={resetToRequest} className="transition hover:text-fg">Usar otro correo</button>
                </div>
              </div>
            </>
          ) : welcomeMode && remembered ? (
            // ----- Bienvenido de nuevo: solo pedir el código -----
            <>
              <h2 className="font-display text-2xl font-bold text-fg">Hola de nuevo 👋</h2>
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-soft">
                <Avatar name={remembered.name || remembered.email} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{remembered.name || remembered.email}</p>
                  <p className="truncate text-xs text-muted">{remembered.email}</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {err && <p className="text-sm text-danger">{err}</p>}
                <button onClick={requestCode} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Enviarme un código
                </button>
                <button onClick={() => { setWelcomeMode(false); setRemembered(null); setErr(""); }} className="w-full text-center text-xs text-muted transition hover:text-curva-pink">
                  No soy {(remembered.name || remembered.email).split(/[\s@]/)[0]} · usar otra cuenta
                </button>
              </div>
            </>
          ) : (
            // ----- Login completo: código de equipo + correo -----
            <>
              <h2 className="font-display text-2xl font-bold text-fg">Inicia sesión</h2>
              <p className="mt-1 text-sm text-muted">Con el código de tu equipo y tu correo. Te mandamos un código de acceso.</p>
              <div className="mt-6 space-y-3">
                <Input icon={<KeyRound size={16} />} value={team} onChange={(v) => setTeam(v)} placeholder="Código de equipo" />
                <Input icon={<AtSign size={16} />} value={email} onChange={setEmail} placeholder="Tu correo" type="email" onEnter={requestCode} />
                {err && <p className="text-sm text-danger">{err}</p>}
                <button onClick={requestCode} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Enviarme un código
                </button>
                <p className="text-center text-[11px] text-muted">Sin contraseñas: entras con un código de un solo uso a tu correo.</p>
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
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-left transition hover:border-accent hover:shadow-sm">
      {/* @ts-expect-error member shape compatible */}
      <Avatar member={m} size={42} />
      <span className="min-w-0"><span className="block font-semibold text-fg">{m.name}</span>{m.role && <span className="block truncate text-xs text-muted">{m.role}</span>}</span>
    </button>
  );
}
function Input({ icon, value, onChange, placeholder, type = "text", onEnter }: { icon: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; type?: string; onEnter?: () => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{icon}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        placeholder={placeholder} type={type} aria-label={placeholder}
        className="w-full rounded-2xl border border-line bg-surface py-3 pl-10 pr-4 text-sm outline-none transition focus:border-accent" />
    </div>
  );
}
function CodeInput({ value, onChange, onEnter }: { value: string; onChange: (v: string) => void; onEnter: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      onKeyDown={(e) => { if (e.key === "Enter") onEnter(); }}
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      aria-label="Código de 6 dígitos"
      className="w-full rounded-2xl border border-line bg-surface py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none transition focus:border-accent"
    />
  );
}
