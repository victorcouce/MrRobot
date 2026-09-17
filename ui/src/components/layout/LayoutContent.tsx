"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppShell } from "./AppShell";
import { CommandPalette } from "../CommandPalette";
import { NewProjectModal } from "../NewProjectModal";

interface NewProjectContextValue {
  /** Abre el modal, opcionalmente con el objetivo ya escrito. */
  openNewProject: (goal?: string) => void;
}

const NewProjectContext = createContext<NewProjectContextValue>({
  openNewProject: () => {},
});

export function useNewProject(): NewProjectContextValue {
  return useContext(NewProjectContext);
}

export function LayoutContent({ children }: { children: ReactNode }) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [initialGoal, setInitialGoal] = useState("");

  const openNewProject = useCallback((goal = "") => {
    setInitialGoal(goal);
    setNewProjectOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        openNewProject();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openNewProject]);

  return (
    <NewProjectContext.Provider value={{ openNewProject }}>
      <AppShell onNewProject={() => openNewProject()}>{children}</AppShell>
      <CommandPalette onNewProject={() => openNewProject()} />
      <NewProjectModal
        open={newProjectOpen}
        initialGoal={initialGoal}
        onClose={() => setNewProjectOpen(false)}
      />
    </NewProjectContext.Provider>
  );
}
