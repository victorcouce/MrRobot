import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AgentAvailability } from "@/lib/types";
import { ChatAgentSelector } from "./ChatAgentSelector";

const availability: AgentAvailability[] = [
  { provider: "codex", label: "Codex", connected: true },
  { provider: "claude", label: "Claude", connected: true },
  {
    provider: "deepseek",
    label: "DeepSeek",
    connected: false,
    reason: "DEEPSEEK_API_KEY no está definida.",
  },
];

describe("ChatAgentSelector", () => {
  it("muestra el chip con el recuento en el aria-label", () => {
    render(
      <ChatAgentSelector
        allowedAgents={[
          { provider: "codex" },
          { provider: "claude", model: "sonnet" },
          { provider: "claude", model: "opus" },
        ]}
        agentAvailability={availability}
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Agentes de este chat: 3 de 6 marcados",
      }),
    ).toBeInTheDocument();
  });

  it("abre el popover con los seis agentes y marca los permitidos", async () => {
    const user = userEvent.setup();
    render(
      <ChatAgentSelector
        allowedAgents={[
          { provider: "codex" },
          { provider: "claude", model: "sonnet" },
          { provider: "claude", model: "opus" },
        ]}
        agentAvailability={availability}
        onSelect={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Agentes de este chat/ }));

    expect(
      screen.getByRole("dialog", { name: "Agentes de este chat" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 de 6")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(6);
    expect(checkboxes.filter((box) => (box as HTMLInputElement).checked)).toHaveLength(3);
  });

  it("deshabilita DeepSeek sin clave y enlaza a Ajustes", async () => {
    const user = userEvent.setup();
    render(
      <ChatAgentSelector
        allowedAgents={[
          { provider: "codex" },
          { provider: "claude", model: "sonnet" },
          { provider: "claude", model: "opus" },
        ]}
        agentAvailability={availability}
        onSelect={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Agentes de este chat/ }));

    const flash = screen.getByRole("checkbox", {
      name: /deepseek-flash/,
    }) as HTMLInputElement;
    expect(flash).toBeDisabled();
    expect(screen.getAllByText("sin clave")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Conectar DeepSeek en Ajustes" }),
    ).toHaveAttribute("href", "/settings");
  });

  it("avisa de la nueva selección al marcar un agente", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatAgentSelector
        allowedAgents={[{ provider: "codex" }]}
        agentAvailability={availability}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Agentes de este chat/ }));
    await user.click(screen.getByRole("checkbox", { name: /claude \/ sonnet/ }));

    expect(onSelect).toHaveBeenCalledWith([
      { provider: "codex" },
      { provider: "claude", model: "sonnet" },
    ]);
  });

  it("no permite desmarcar el último agente", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatAgentSelector
        allowedAgents={[{ provider: "codex" }]}
        agentAvailability={availability}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Agentes de este chat/ }));
    expect(screen.getByRole("checkbox", { name: /codex/ })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("permite quitar un escritor mientras quede otro (DeepSeek escribe con el harness)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const connected: AgentAvailability[] = [
      { provider: "codex", label: "Codex", connected: true },
      { provider: "claude", label: "Claude", connected: true },
      { provider: "deepseek", label: "DeepSeek", connected: true },
    ];
    render(
      <ChatAgentSelector
        allowedAgents={[
          { provider: "codex" },
          { provider: "deepseek", model: "deepseek-flash" },
        ]}
        agentAvailability={connected}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Agentes de este chat/ }));
    // DeepSeek también escribe (harness), así que Codex no queda bloqueado.
    expect(screen.getByRole("checkbox", { name: /codex/ })).not.toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /deepseek-flash/ }),
    ).not.toBeDisabled();
  });
});
