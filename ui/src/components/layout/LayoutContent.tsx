"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { CommandPalette } from "../CommandPalette";
import { useAppInfo } from "../../lib/hooks";
import { hasConnectedFileWriter } from "../../lib/agent-setup";
import { isOnboardingDismissed } from "../../lib/onboarding";

const ONBOARDING_PATH = "/onboarding";

/**
 * Lleva al asistente de configuración la primera vez, o cuando no queda ningún
 * agente conectado que escriba código, salvo que el usuario ya lo haya
 * completado u omitido en esta pestaña.
 */
function OnboardingGuard() {
  const router = useRouter();
  const { info } = useAppInfo();

  useEffect(() => {
    if (!info || info.mock || isOnboardingDismissed()) return;
    if (!info.onboarding?.completed || !hasConnectedFileWriter(info.agents)) {
      router.replace(ONBOARDING_PATH);
    }
  }, [info, router]);

  return null;
}

export function LayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const onboarding = usePathname() === ONBOARDING_PATH;
  const [paletteOpen, setPaletteOpen] = useState(false);

  const goToNewChat = useCallback(() => {
    router.push("/");
  }, [router]);

  const goToNewProject = useCallback(() => {
    router.push("/?new=project");
  }, [router]);

  useEffect(() => {
    // ⌘N y ⌘⇧O (el atajo de ChatGPT) abren un chat nuevo.
    const handleKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if ((mod && !event.shiftKey && key === "n") || (mod && event.shiftKey && key === "o")) {
        event.preventDefault();
        goToNewChat();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNewChat]);

  // El asistente ocupa toda la pantalla, sin barra lateral ni atajos.
  if (onboarding) return <>{children}</>;

  return (
    <>
      <OnboardingGuard />
      <AppShell
        onNewChat={goToNewChat}
        onNewProject={goToNewProject}
        onOpenSearch={() => setPaletteOpen(true)}
      >
        {children}
      </AppShell>
      <CommandPalette
        onNewChat={goToNewChat}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </>
  );
}
