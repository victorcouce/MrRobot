import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyAndPersistEnvVar,
  loadSettings,
  saveSettings,
  upsertEnvVar,
} from "./persist.js";

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mrrobot-persist-"));
}

test("upsertEnvVar crea el .env si no existe, solo legible por su dueño", async () => {
  const path = join(await tempDir(), ".env");

  await upsertEnvVar(path, "DEEPSEEK_API_KEY", "sk-123");

  assert.equal(await readFile(path, "utf8"), "DEEPSEEK_API_KEY=sk-123\n");
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("upsertEnvVar reemplaza la clave y conserva el resto de líneas", async () => {
  const path = join(await tempDir(), ".env");
  await writeFile(
    path,
    "# claves\nGITHUB_TOKEN=viejo\nMRROBOT_PORT=4000\nexport GITHUB_TOKEN=duplicado\n",
  );

  await upsertEnvVar(path, "GITHUB_TOKEN", "ghp_nuevo");
  await upsertEnvVar(path, "LMSTUDIO_BASE_URL", "http://localhost:1234/v1");

  assert.equal(
    await readFile(path, "utf8"),
    "# claves\nGITHUB_TOKEN=ghp_nuevo\nMRROBOT_PORT=4000\nLMSTUDIO_BASE_URL=http://localhost:1234/v1\n",
  );
});

test("upsertEnvVar entrecomilla valores con espacios y rechaza saltos de línea", async () => {
  const path = join(await tempDir(), ".env");

  await upsertEnvVar(path, "VALOR", "con espacio #1");
  assert.equal(await readFile(path, "utf8"), 'VALOR="con espacio #1"\n');

  await assert.rejects(upsertEnvVar(path, "VALOR", "a\nb"));
  await assert.rejects(upsertEnvVar(path, "MAL NOMBRE", "x"));
});

test("applyAndPersistEnvVar aplica al entorno y guarda en MRROBOT_ENV_FILE", async () => {
  const path = join(await tempDir(), "custom.env");
  const env: NodeJS.ProcessEnv = { MRROBOT_ENV_FILE: path };

  const result = await applyAndPersistEnvVar("GITHUB_TOKEN", "ghp_x", env);

  assert.deepEqual(result, { persisted: true });
  assert.equal(env.GITHUB_TOKEN, "ghp_x");
  assert.equal(await readFile(path, "utf8"), "GITHUB_TOKEN=ghp_x\n");
});

test("loadSettings/saveSettings hacen round-trip y toleran ficheros ausentes o corruptos", async () => {
  const dir = await tempDir();
  const path = join(dir, "nested", "config.json");

  assert.deepEqual(await loadSettings(path), {});

  const settings = {
    config: { concurrency: 4 },
    onboardingCompletedAt: "2026-09-29T10:00:00.000Z",
  };
  await saveSettings(path, settings);
  assert.deepEqual(await loadSettings(path), settings);

  const corrupt = join(dir, "corrupt.json");
  await writeFile(corrupt, "{no es json");
  assert.deepEqual(await loadSettings(corrupt), {});
});
