"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { CommandPalette } from "../CommandPalette";

export function LayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter();
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

  return (
    <>
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
