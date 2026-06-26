"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { TopNav } from "@/components/TopNav";
import { BottomNav } from "@/components/BottomNav";
import { TaskSwitcher } from "@/components/TaskSwitcher";
import { IdleReview } from "@/components/IdleReview";
import { DesktopBridge } from "@/components/DesktopBridge";
import { NotionSync } from "@/components/NotionSync";
import { Hotkeys } from "@/components/Hotkeys";
import { DoneCelebration } from "@/components/DoneCelebration";
import { MusicProbe } from "@/components/MusicProbe";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { MeetingWatcher } from "@/components/MeetingWatcher";
import { AISync } from "@/components/AISync";
import { AILiveProvider } from "@/lib/use-ai-live";
import { CoworkingProvider } from "@/lib/use-coworking";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, currentUserId, openTasks } = useApp();
  const { ready: dataReady } = useData();

  useEffect(() => {
    if (ready && !currentUserId) router.replace("/login");
  }, [ready, currentUserId, router]);

  if (!ready || !dataReady || !currentUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Cargando…
      </div>
    );
  }

  // Espacio inferior para que el dock de pestañas / bottom nav no tapen contenido.
  const hasDock = openTasks.length > 0;

  return (
    <AILiveProvider>
    <CoworkingProvider>
    <div className="min-h-screen">
      <TopNav />
      <main
        className="mx-auto max-w-5xl px-4 py-6 sm:py-8"
        style={{ paddingBottom: hasDock ? 140 : 88 }}
      >
        {children}
      </main>
      <TaskSwitcher />
      <BottomNav />
      <IdleReview />
      <DesktopBridge />
      <NotionSync />
      <Hotkeys />
      <DoneCelebration />
      <MusicProbe />
      <PresenceHeartbeat />
      <MeetingWatcher />
      <AISync />
    </div>
    </CoworkingProvider>
    </AILiveProvider>
  );
}
