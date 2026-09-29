import "@testing-library/jest-dom/vitest";

// jsdom no implementa scrollIntoView y el hilo lo usa para seguir el final de
// la conversación.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
