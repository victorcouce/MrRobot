import { startServer, type StartOptions } from "./server.js";

const port = Number(process.env.MRROBOT_PORT ?? 4000);
const host = process.env.MRROBOT_HOST ?? "127.0.0.1";
const mock = process.env.MRROBOT_MOCK === "1";
const scenario =
  process.env.MRROBOT_MOCK_SCENARIO === "replan"
    ? "replan"
    : process.env.MRROBOT_MOCK_SCENARIO === "fail"
      ? "fail"
      : "success";
const mockDelayMs = Number(process.env.MRROBOT_MOCK_DELAY_MS ?? 0);
const repoCwd = process.env.MRROBOT_REPO;
const dataDir = process.env.MRROBOT_DATA_DIR ?? ".mrrobot/data";

const options: StartOptions = {
  port,
  host,
  mock,
  scenario,
  mockDelayMs: Number.isFinite(mockDelayMs) ? mockDelayMs : 0,
  dataDir,
  ...(repoCwd ? { repoCwd } : {}),
};

startServer(options).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
