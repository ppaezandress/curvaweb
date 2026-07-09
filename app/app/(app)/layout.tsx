"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MotionConfig } from "motion/react";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useApp } from "@/lib/app-context";
import { useData } from "@/lib/data-context";
import { TopNav } from "@/components/TopNav";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { TaskSwitcher } from "@/components/TaskSwitcher";
import { IdleReview } from "@/components/IdleReview";
import { StaleTimerNotice } from "@/components/StaleTimerNotice";
import { DesktopBridge } from "@/components/DesktopBridge";
import { NotionSync } from "@/components/NotionSync";
import { Hotkeys } from "@/components/Hotkeys";
import { DoneCelebration } from "@/components/DoneCelebration";
import { MusicProbe } from "@/components/MusicProbe";
import { PresenceHeartbeat } from "@/components/PresenceHeartbeat";
import { MeetingWatcher } from "@/components/MeetingWatcher";
import { MeetingReminder } from "@/components/MeetingReminder";
import { ManualEntryHost } from "@/components/ManualEntryHost";
import { AISync } from "@/components/AISync";
import { SupportButton } from "@/components/SupportButton";
import { Toaster } from "@/lib/toast";
import { AILiveProvider } from "@/lib/use-ai-live";
import { CoworkingProvider } from "@/lib/use-coworking";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { ready, currentUserId, openTasks } = useApp();
  const { ready: dataReady, source } = useData();

  useEffect(() => {
    if (ready && !currentUserId) router.replace("/login");
  }, [ready, currentUserId, router]);

  if (!ready || !dataReady || !currentUserId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5">
        <Logo className="breathe text-3xl text-fg" />
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Cargando tu espacio…
        </div>
      </div>
    );
  }

  // Espacio inferior para que el dock de pestañas / bottom nav no tapen contenido.
  const hasDock = openTasks.length > 0;

  return (
    <MotionConfig reducedMotion="user">
    <AILiveProvider>
    <CoworkingProvider>
    <div className="flex min-h-screen">
      {/* Sidebar (desktop) — sensación de app */}
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header solo en móvil/tablet; en desktop la nav vive en el sidebar */}
        <div className="lg:hidden">
          <TopNav />
        </div>

        <main
          className={`mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 ${
            hasDock ? "pb-[150px] sm:pb-[120px] lg:pb-[120px]" : "pb-[88px] lg:pb-10"
          }`}
        >
          {(source === "mock" || source === "mock-local") && (
            <div className="mb-5 flex items-center gap-2 rounded-card border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg">
              <span className="text-warn">●</span> Estás viendo <b>datos de prueba</b> — no se pudo conectar a Notion ahorita. Tu tiempo medido sí se guarda; recarga en un rato para ver tu info real.
            </div>
          )}
          {children}
        </main>
      </div>

      <TaskSwitcher />
      <BottomNav />
      <IdleReview />
      <StaleTimerNotice />
      <DesktopBridge />
      <NotionSync />
      <Hotkeys />
      <DoneCelebration />
      <MusicProbe />
      <PresenceHeartbeat />
      <MeetingWatcher />
      <MeetingReminder />
      <ManualEntryHost />
      <AISync />
      <SupportButton />
      <Toaster />
    </div>
    </CoworkingProvider>
    </AILiveProvider>
    </MotionConfig>
  );
}
