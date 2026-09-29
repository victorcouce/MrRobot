import { streamUrl } from "./api";

export type StreamStatus = "connecting" | "open" | "closed";

export function subscribeProject(
  projectId: string,
  onEvent: (event: { type: string } & Record<string, unknown>) => void,
  onStatus?: (status: StreamStatus) => void,
): () => void {
  const source = new EventSource(streamUrl(projectId));

  source.onopen = () => onStatus?.("open");
  source.onerror = () => onStatus?.("connecting");
  source.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data as string) as {
        type: string;
      } & Record<string, unknown>;
      onEvent(data);
    } catch {
      // Ignorar payloads no JSON (pings).
    }
  };

  return () => {
    source.close();
    onStatus?.("closed");
  };
}
