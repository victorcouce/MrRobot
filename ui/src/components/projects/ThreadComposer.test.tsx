import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadComposer } from "./ThreadComposer";

describe("ThreadComposer", () => {
  it("en un proyecto muestra el selector de modo y avisa al cambiarlo", () => {
    const onModeChange = vi.fn();
    render(
      <ThreadComposer
        status="completed"
        onSendMessage={vi.fn()}
        mode="auto"
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Modo: Automático. Cambiar modo" }));
    fireEvent.click(screen.getByRole("button", { name: /^Rápido/ }));

    expect(onModeChange).toHaveBeenCalledWith("fast");
  });

  it("en un chat suelto no hay selector de modo", () => {
    render(<ThreadComposer status="idle" onSendMessage={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Modo:/ })).toBeNull();
  });
});
