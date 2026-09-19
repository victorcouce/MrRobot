"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "./AppShell";
import { CommandPalette } from "../CommandPalette";

export function LayoutContent({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const goToNewProject = useCallback(() => {
    router.push("/");
  }, [router]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        goToNewProject();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNewProject]);

  return (
    <>
      <AppShell
        onNewProject={goToNewProject}
        onOpenSearch={() => setPaletteOpen(true)}
      >
        {children}
      </AppShell>
      <CommandPalette
        onNewProject={goToNewProject}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </>
  );
}
