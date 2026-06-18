"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { TopNav } from "@/components/TopNav";
import { ActiveTimerBar } from "@/components/ActiveTimerBar";
import { IdleNudge } from "@/components/IdleNudge";
import { DesktopBridge } from "@/components/DesktopBridge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, currentUserId } = useApp();

  useEffect(() => {
    if (ready && !currentUserId) router.replace("/login");
  }, [ready, currentUserId, router]);

  if (!ready || !currentUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-400">
        Cargando…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ActiveTimerBar />
      <TopNav />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <IdleNudge />
      <DesktopBridge />
    </div>
  );
}
