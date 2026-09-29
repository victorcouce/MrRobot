"use client";

import { useState } from "react";
import type { ProjectEvent, Task, TaskInstructionOutcome } from "../../lib/types";
import { Button } from "../ui/Button";
import { Tabs } from "../ui/Tabs";
import { DagView } from "./DagView";
import { TaskTable } from "./TaskTable";

export function PlanView({
  tasks,
  events,
  onSelectTask,
  onAddTask,
  onSendInstructions,
}: {
  tasks: Task[];
  events: ProjectEvent[];
  onSelectTask: (id: string) => void;
  onAddTask?: () => void;
  onSendInstructions?: (taskId: string, instructions: string) => Promise<TaskInstructionOutcome>;
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
        <TaskTable
          tasks={tasks}
          events={events}
          onSelect={onSelectTask}
          onSendInstructions={onSendInstructions}
        />
      ) : (
        <DagView tasks={tasks} onSelect={onSelectTask} />
      )}
    </div>
  );
}
