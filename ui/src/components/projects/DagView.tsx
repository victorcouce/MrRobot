"use client";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { Task } from "../../lib/types";
import { TASK_STATUS } from "../../lib/status";
import { agentLabel } from "../../lib/api";
import { clsx } from "../../lib/cx";

const NODE_WIDTH = 208;
const NODE_HEIGHT = 56;
const HORIZONTAL_GAP = 24;
const VERTICAL_GAP = 72;

function TaskNodeContent({ task }: { task: Task }) {
  const status = TASK_STATUS[task.status];
  return (
    <div
      className={clsx(
        "flex h-full w-full flex-col justify-center rounded-md border px-3 text-left",
        task.status === "running"
          ? "border-blue-400 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            status.pulse && "pulse-dot",
            statusDotColor(status.color),
          )}
        />
        <span className="font-mono text-[10px] text-zinc-400">{task.id}</span>
      </div>
      <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
        {task.title}
      </div>
      <div className="text-[10px] text-zinc-400">{agentLabel(task.agent)}</div>
    </div>
  );
}

function statusDotColor(color: string): string {
  const map: Record<string, string> = {
    zinc: "bg-zinc-400",
    amber: "bg-amber-500",
    sky: "bg-sky-500",
    blue: "bg-blue-500",
    orange: "bg-orange-500",
    emerald: "bg-emerald-500",
    red: "bg-red-500",
  };
  return map[color] ?? "bg-zinc-400";
}

function layout(tasks: Task[]): { nodes: Node[]; edges: Edge[] } {
  const depth = new Map<string, number>();

  function computeDepth(task: Task): number {
    const cached = depth.get(task.id);
    if (cached !== undefined) return cached;

    const deps = task.dependsOn ?? [];
    const value =
      deps.length === 0
        ? 0
        : Math.max(
            ...deps.map((depId) => {
              const dep = tasks.find((candidate) => candidate.id === depId);
              return dep ? computeDepth(dep) + 1 : 0;
            }),
          );
    depth.set(task.id, value);
    return value;
  }

  tasks.forEach(computeDepth);

  const byDepth = new Map<number, Task[]>();
  for (const task of tasks) {
    const d = depth.get(task.id) ?? 0;
    const list = byDepth.get(d) ?? [];
    list.push(task);
    byDepth.set(d, list);
  }

  const nodes: Node[] = [];
  const levels = [...byDepth.keys()].sort((a, b) => a - b);

  for (const level of levels) {
    const levelTasks = byDepth.get(level) ?? [];
    const totalWidth =
      levelTasks.length * NODE_WIDTH +
      (levelTasks.length - 1) * HORIZONTAL_GAP;

    levelTasks.forEach((task, index) => {
      nodes.push({
        id: task.id,
        type: "default",
        position: {
          x: index * (NODE_WIDTH + HORIZONTAL_GAP) - totalWidth / 2,
          y: level * (NODE_HEIGHT + VERTICAL_GAP),
        },
        data: { label: <TaskNodeContent task={task} /> },
        style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      });
    });
  }

  const edges: Edge[] = [];
  for (const task of tasks) {
    for (const depId of task.dependsOn ?? []) {
      edges.push({
        id: `${depId}->${task.id}`,
        source: depId,
        target: task.id,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a1a1aa", strokeWidth: 1.5 },
      });
    }
  }

  return { nodes, edges };
}

export function DagView({
  tasks,
  onSelect,
}: {
  tasks: Task[];
  onSelect: (id: string) => void;
}) {
  const { nodes, edges } = useMemo(() => layout(tasks), [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-zinc-500">
        No hay tareas que visualizar.
      </div>
    );
  }

  return (
    <div className="h-[560px] w-full overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        onNodeClick={(_, node) => onSelect(node.id)}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
