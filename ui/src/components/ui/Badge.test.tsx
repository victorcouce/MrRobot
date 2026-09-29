import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./Badge";
import { ProgressBar } from "./Progress";

describe("StatusBadge", () => {
  it("muestra la etiqueta de estado", () => {
    render(<StatusBadge label="Running" color="blue" />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("no depende solo del color: incluye texto", () => {
    render(<StatusBadge label="Completed" color="emerald" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});

describe("ProgressBar", () => {
  it("expone el progreso mediante aria", () => {
    render(<ProgressBar value={72} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "72");
  });
});
