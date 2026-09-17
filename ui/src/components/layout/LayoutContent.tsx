"use client";

import { useState, useEffect, ReactNode } from "react";
import { AppShell } from "./AppShell";
import { CommandPalette } from "../CommandPalette";
import { NewProjectModal } from "../NewProjectModal";

export function LayoutContent({ children }: { children: ReactNode }) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setNewProjectOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      <AppShell onNewProject={() => setNewProjectOpen(true)}>
        {children}
      </AppShell>
      <CommandPalette />
      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
      />
    </>
  );
}
