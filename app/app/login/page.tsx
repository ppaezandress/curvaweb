"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";

export default function LoginPage() {
  const router = useRouter();
  const { setCurrentUser } = useApp();
  const { members, ready } = useData();

  const enter = (id: string) => {
    setCurrentUser(id);
    router.push("/dashboard");
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <section className="curva-gradient relative hidden flex-col justify-between p-12 text-white lg:flex">
        <Logo className="text-3xl" />
        <div>
          <h1 className="max-w-md font-display text-4xl font-bold leading-tight">
            Mide el tiempo. <br /> Decide con datos.
          </h1>
          <p className="mt-4 max-w-sm text-white/80">
            Registra cuánto toma cada tarea, por persona y por proyecto. La base
            para cobrar bien y planear mejor.
          </p>
        </div>
        <p className="text-sm text-white/60">Plataforma interna · CURVA</p>
      </section>

      {/* Selector de usuario */}
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo className="text-3xl text-ink" />
          </div>
          <h2 className="font-display text-2xl font-bold text-ink">¿Quién eres?</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Entra con tu usuario para empezar a medir tu tiempo.
          </p>

          <div className="mt-6 space-y-2">
            {!ready && (
              <p className="py-6 text-center text-sm text-zinc-400">
                Cargando equipo desde Notion…
              </p>
            )}
            {ready && members.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-400">
                No se encontraron personas. ¿La conexión tiene acceso a las bases?
              </p>
            )}
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => enter(m.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-curva-purple hover:shadow-sm"
              >
                <Avatar member={m} size={42} />
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{m.name}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {m.role}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 border-t border-line pt-6">
            <button
              disabled
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-zinc-50 p-3 text-sm font-medium text-zinc-400"
              title="Disponible cuando conectemos el dominio y Google Workspace"
            >
              Entrar con Google
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
                próximamente
              </span>
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
