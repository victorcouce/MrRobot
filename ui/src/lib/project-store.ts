type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyProjectsChanged(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeProjectsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
