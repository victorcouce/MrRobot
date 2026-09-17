"use client";

import { useState } from "react";
import type { Task } from "../../lib/types";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { DagView } from "./DagView";
import { TaskTable } from "./TaskTable";

export function PlanView({
  tasks,
  onSelectTask,
  onAddTask,
}: {
  tasks: Task[];
  onSelectTask: (id: string) => void;
  onAddTask?: () => void;
}) {
  const [view, setView] = useState<"list" | "graph">("list");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs
          tabs={[
            { id: "list", label: "List", count: tasks.length },
            { id: "graph", label: "Graph" },
          ]}
          active={view}
          onChange={(id) => setView(id as "list" | "graph")}
        />
        {onAddTask && (
          <Button size="sm" onClick={onAddTask}>
            Add task
          </Button>
        )}
      </div>

      {view === "list" ? (
        <TaskTable tasks={tasks} onSelect={onSelectTask} />
      ) : (
        <DagView tasks={tasks} onSelect={onSelectTask} />
      )}
    </div>
  );
}
