# MrRobot — Documentación técnica completa

> Orquestador multiagente para desarrollo de software. Recibe un objetivo de
> alto nivel, lo descompone en un DAG de tareas, las ejecuta con **Codex /
> Claude / DeepSeek** en **Git worktrees aislados**, revisa y valida el
> resultado, y deja todo el trabajo en una **branch Git aislada** (nunca hace
> merge a `main`).

Este documento describe **qué es**, **todas sus funcionalidades** y **todos los
flujos posibles** (backend, API, CLI, UI, estados, errores y recuperación).

---

## Índice

1. [Qué es MrRobot](#1-qué-es-mrrobot)
2. [Conceptos clave](#2-conceptos-clave)
3. [Arquitectura](#3-arquitectura)
4. [Requisitos e instalación](#4-requisitos-e-instalación)
5. [Puesta en marcha](#5-puesta-en-marcha)
6. [Configuración](#6-configuración)
7. [Variables de entorno](#7-variables-de-entorno)
8. [Modelo de dominio (tipos)](#8-modelo-de-dominio-tipos)
9. [Proveedores y agentes](#9-proveedores-y-agentes)
10. [Planner (descomposición del objetivo)](#10-planner-descomposición-del-objetivo)
11. [Scheduler (ejecución del DAG)](#11-scheduler-ejecución-del-dag)
12. [Ejecución de tareas (retries + fallback + worktrees)](#12-ejecución-de-tareas-retries--fallback--worktrees)
13. [Reviewer y checks locales](#13-reviewer-y-checks-locales)
14. [Supervisor y replanificación](#14-supervisor-y-replanificación)
15. [Orquestación de proyecto](#15-orquestación-de-proyecto)
16. [Workspace y Git](#16-workspace-y-git)
17. [Persistencia (storage)](#17-persistencia-storage)
18. [Chats por proyecto](#18-chats-por-proyecto)
19. [Preview (servidor de desarrollo)](#19-preview-servidor-de-desarrollo)
20. [Importar proyectos](#20-importar-proyectos)
21. [API HTTP](#21-api-http)
22. [Tiempo real (SSE)](#22-tiempo-real-sse)
23. [CLI](#23-cli)
24. [Interfaz gráfica (UI)](#24-interfaz-gráfica-ui)
25. [Máquinas de estado](#25-máquinas-de-estado)
26. [Event log](#26-event-log)
27. [Modo mock](#27-modo-mock)
28. [Todos los flujos posibles](#28-todos-los-flujos-posibles)
29. [Errores y códigos HTTP](#29-errores-y-códigos-http)
30. [Tests](#30-tests)
31. [Limitaciones actuales](#31-limitaciones-actuales)

---

## 1. Qué es MrRobot

MrRobot es un **motor multiagente en TypeScript** que orquesta varios LLM para
construir software de forma autónoma a partir de una descripción en lenguaje
natural.

Dado un **objetivo** (p. ej. *"Crear una librería TypeScript con `sum(a,b)`,
tests y README"*), el motor:

1. **Planifica**: un planner LLM descompone el objetivo en un **DAG de tareas**
   (con dependencias, tipo, complejidad y criterios de aceptación).
2. **Valida** el DAG (IDs únicos, dependencias existentes, sin ciclos).
3. **Ejecuta** las tareas en paralelo (con límite de concurrencia) respetando
   dependencias, cada una **aislada en un Git worktree**.
4. **Selecciona el mejor agente** por tipo/complejidad y **hace fallback** a
   otros modelos si uno falla, agota cuota o alcanza su límite.
5. **Revisa** cada tarea (checks locales + reviewer LLM) y la **reintenta con
   feedback** si no cumple los criterios.
6. **Supervisa** el resultado global y decide `continue | replan | pause | fail`.
7. **Finaliza** integrando todos los commits en una **branch aislada**
   (`agent/project-<id>-final`), opcionalmente con **push** al remoto.

### Filosofía de diseño

- **Sin coste extra de tokens**: Codex y Claude se autentican con tu
  **suscripción normal** (ChatGPT Plus/Pro, Claude). DeepSeek es el único que
  requiere `DEEPSEEK_API_KEY`.
- **Nunca destructivo**: el motor **jamás** hace merge a `main`/`master` ni
  toca el working tree principal. Todo ocurre en worktrees y branches aisladas.
- **Backend como única fuente de verdad**: la UI reconstruye el estado desde la
  API; un `F5` en mitad de una ejecución no pierde nada.
- **Fail-safe**: planner/reviewer/supervisor validan su salida con Zod; ante
  respuestas inválidas el motor reintenta o continúa de forma segura.

---

## 2. Conceptos clave

| Término | Significado |
|---|---|
| **Proyecto** | Entidad de alto nivel con un objetivo, un DAG de tareas y un estado. |
| **Tarea (Task)** | Unidad de trabajo atómica con `type`, `complexity`, `dependsOn`, `acceptanceCriteria`. |
| **Plan / DAG** | Grafo acíclico dirigido de tareas generado por el planner. |
| **Agente** | Un proveedor + modelo concreto: `codex`, `claude/sonnet`, `claude/opus`, `deepseek-flash`, `deepseek-v4-pro`. |
| **Fallback chain** | Lista ordenada de agentes candidatos para una tarea. |
| **Worktree** | Copia de trabajo Git aislada (`.worktrees/...`) por intento de tarea. |
| **Attempt** | Un intento concreto de un agente sobre una tarea. |
| **Review** | Veredicto del reviewer LLM (aprobado / rechazado + issues). |
| **Check** | Script local (`npm run typecheck/build/test`) ejecutado sobre el resultado. |
| **Supervisor** | Agente que decide si continuar, replanificar, pausar o fallar. |
| **Chat** | Hilo de conversación por proyecto que genera/ajusta tareas vía planner. |
| **Preview** | Servidor de desarrollo del proyecto completado, levantado en un worktree. |
| **Event log** | Registro append-only de todo lo que ocurre en el proyecto. |

---

## 3. Arquitectura

```text
UI (ui/ — Next.js App Router)
 ↓  HTTP + SSE
API (src/api — capa HTTP fina, Node http)
 ↓
Project service (src/projects)  +  Chats (src/chats)  +  Preview (src/preview)
 ↓
LangGraph (src/graph)         planner → run → supervise → finalize
 ↓
Planner / Scheduler / Supervisor (src/planner, src/scheduler, src/supervisor)
 ↓
Tasks (src/tasks)             runTask: retries + fallbacks + worktrees
 ↓
Agent Router (src/agents)     selectAgent + getFallbackChain + runAgent
 ↓
Codex / Claude / DeepSeek (src/providers)
 ↓
Git worktrees (src/workspace)
 ↓
Storage (src/storage)         PGlite (Postgres) o memoria
```

Principios de la arquitectura:

- La **UI nunca** llama directamente a Codex/Claude/DeepSeek, Git, worktrees ni
  a PostgreSQL. Todo pasa por la **API HTTP** (`src/api`).
- Los **route handlers** no contienen lógica de dominio: delegan en
  `projects/service.ts`, `projects/plan-editor.ts`, `chats/service.ts`, etc.
- Los **tipos del wire** se comparten en `shared/types.ts` entre backend y UI.

### Mapa de módulos

| Módulo | Responsabilidad |
|---|---|
| `providers/` | Ejecutan CLIs/API: `runCodex`, `runClaude`, `runDeepSeek`. |
| `agents/` | `selectAgent`, `getFallbackChain`, `isRetryableError`, `runAgent`. |
| `tasks/` | `runTask`: retries por agente + fallback entre agentes, cada intento en worktree limpio. |
| `scheduler/` | Valida el DAG y lo ejecuta en paralelo con límite de concurrencia. |
| `workspace/` | Worktrees, commits, cherry-pick de dependencias y branch final. |
| `planner/` | Genera el DAG (salida validada con Zod). |
| `reviewer/` | Revisa tareas contra sus criterios de aceptación. |
| `supervisor/` | Decide `continue | replan | pause | fail`. |
| `projects/` | Entidad Project y orquestación (crear/planificar/ejecutar/pausar/reanudar). |
| `chats/` | Hilos de conversación por proyecto; cada mensaje pasa por el planner. |
| `storage/` | Persistencia (PGlite/memoria) + event log. |
| `checks/` | Detección y ejecución de scripts de verificación locales. |
| `preview/` | Levanta el servidor de desarrollo del proyecto completado. |
| `graph/` | Grafo LangGraph que orquesta planner/scheduler/supervisor. |
| `api/` | Servidor HTTP, runtime, serialización, parsing, mock. |
| `cli/` | Comandos de terminal. |

---

## 4. Requisitos e instalación

### Requisitos básicos

- **Node.js 20+** y **npm**
- **git**

### Para ejecutar tareas reales (no mock)

El motor invoca los CLIs `codex` y `claude` directamente, por lo que deben estar
instalados, en el `PATH` y autenticados una vez:

```bash
# Codex CLI — provider codex (tareas de código complejas)
npm install -g @openai/codex
codex login

# Claude Code CLI — planner, reviewer, supervisor y tareas
npm install -g @anthropic-ai/claude-code
claude          # la primera vez abre el flujo de autenticación
```

- **DeepSeek** es vía HTTP; no necesita CLI, solo `DEEPSEEK_API_KEY`.

> **No hace falta contratar tokens ni una API de pago aparte.** Codex y Claude
> usan tu suscripción normal de ChatGPT / Claude. El único proveedor con clave
> de API es DeepSeek.

Si solo quieres probar sin gastar tokens, usa el **modo mock** (ver §27) y no
necesitas instalar ni autenticar nada.

### Instalación

```bash
npm install                     # backend
cd ui && npm install && cd ..   # interfaz gráfica
```

---

## 5. Puesta en marcha

Abre **dos terminales** desde la raíz del repo:

```bash
# Terminal 1 — backend (API en http://127.0.0.1:4000, recarga al cambiar el código)
npm run dev

# Terminal 2 — interfaz (http://localhost:3000)
cd ui && npm run dev
```

Luego abre **http://localhost:3000**.

### Modo mock (sin tokens)

```bash
MRROBOT_MOCK=1 npm run dev     # Terminal 1
cd ui && npm run dev           # Terminal 2
```

### Scripts npm (raíz)

| Script | Comando | Uso |
|---|---|---|
| `npm run dev` | `tsx watch --env-file=.env src/api/index.ts` | Arranca la API recargando al cambiar el código. |
| `npm run api` | `tsx --env-file=.env src/api/index.ts` | Arranca la API sin recarga automática. |
| `npm run demo` | `tsx --env-file=.env src/index.ts` | Demo del scheduler con 2 tareas. |
| `npm run mrrobot` | `tsx --env-file=.env src/cli/index.ts` | CLI. |
| `npm test` | `tsx --test src/**/*.test.ts` | Tests del motor. |
| `npm run typecheck` | `tsc --noEmit` | Chequeo de tipos del backend. |

---

## 6. Configuración

Configuración central en `src/config/index.ts` (`loadConfig`, `mergeConfig`).

### Valores por defecto (`defaultConfig`)

```ts
{
  concurrency: 2,             // concurrencia inicial
  maxConcurrency: 4,          // tope de la concurrencia adaptativa
  maxRetriesPerAgent: 1,      // reintentos por agente (=> hasta 2 intentos)
  maxReviewFixCycles: 2,      // ciclos review/fix (=> hasta 3 ejecuciones)
  plannerMaxAttempts: 2,      // intentos del planner para un plan válido
  limitRetry: {               // reintento de la cadena completa al agotar límites
    maxLimitRetries: 3,       //   veces que se re-recorre la cadena
    baseDelayMs: 30000,       //   espera base si no hay "retry after"
    maxDelayMs: 900000,       //   tope de la espera (15 min)
  },
  checks: { commands: [] },   // [] => autodetecta scripts npm
  defaultAllowedAgents: [],   // [] => sin restricción (el usuario los elige en el chat)
}
```

No hay agentes fijos por rol. El usuario elige el conjunto de agentes permitidos
al lanzar el primer prompt del chat; el motor selecciona el agente por tipo y
complejidad (`selectAgent`/`getFallbackChain`) tanto para las tareas como para
los roles de orquestación (planner, reviewer, supervisor, grill e instrucciones)
a través de `runRoleAgent` (`src/agents/role.ts`).

- `loadConfig(overrides)`: `{ ...defaultConfig, ...overrides, checks: { ...defaultConfig.checks, ...overrides.checks } }`.
- `mergeConfig(base, overrides)`: igual pero partiendo de `base`.
- `fallbackCodingAgent = { provider: "deepseek", model: "deepseek-flash" }`.

### Config por proyecto

Un proyecto puede sobrescribir la config global:

- Al crearse (pantalla *New Project*, sección avanzada) o vía
  `POST /api/projects` con el campo `config`.
- Después, mediante `PATCH /api/projects/:id/config` **mientras esté en
  `draft`, `ready` o `paused`**.

Al primer cambio, el proyecto **materializa su propia config** (deja de heredar
de la global). Si no define config, usa la global.

> Nota de implementación: `createProject` (no borrador) **no persiste**
> `input.config`; `createProjectDraft` **sí**. En la API, el runtime aplica los
> overrides de config al crear el proyecto.

---

## 7. Variables de entorno

```env
DEEPSEEK_API_KEY=...              # requerido por el provider DeepSeek
GITHUB_TOKEN=...                  # opcional: valida/push a repos GitHub (HTTPS)
MRROBOT_DATA_DIR=.mrrobot/data    # directorio de datos PGlite
MRROBOT_PORT=4000                 # puerto de la API
MRROBOT_HOST=127.0.0.1            # host de la API
MRROBOT_REPO=...                  # directorio del repositorio Git
MRROBOT_MOCK=1                    # modo mock (agentes y git simulados)
MRROBOT_MOCK_SCENARIO=success|replan|fail
MRROBOT_MOCK_DELAY_MS=0           # retardo artificial por ejecución de agente
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000   # usado por la UI
```

- `MRROBOT_MOCK` es mock **solo si vale exactamente `"1"`**.
- `MRROBOT_MOCK_SCENARIO` solo reconoce `"replan"` y `"fail"`; cualquier otro
  valor es `"success"`.

---

## 8. Modelo de dominio (tipos)

Tipos del wire compartidos en `shared/types.ts`.

### Enumeraciones

```ts
ProjectStatus = draft | planning | ready | running | paused | blocked
              | completed | failed | cancelled

TaskStatus    = todo | blocked | ready | running | interrupted | done | failed

TaskType      = planning | architecture | coding | review | testing | research

TaskComplexity = low | medium | high | critical

AgentProvider = codex | claude | deepseek
```

### AgentSpec

```ts
| { provider: "codex" }                                       // sin modelo
| { provider: "claude"; model?: "sonnet" | "opus" }
| { provider: "deepseek"; model?: "deepseek-flash" | "deepseek-v4-pro" }
```

### Task

Campos principales: `id`, `title`, `description`, `status`, `type`,
`complexity`, `chatId?`, `dependsOn?`, `blockedReason?`, `acceptanceCriteria?`,
`integrationError?`, `agent?` (selección explícita), `executedBy?` (agente que la
ejecutó), `attempts?`, `resultCommit?`, `output?`, `error?`, `startedAt?`,
`finishedAt?`.

### Project

`id`, `name`, `goal`, `status`, `baseRef`, `repoPath?`, `remoteUrl?`, `tasks[]`,
`config?`, `createdAt`, `updatedAt`, `startedAt?`, `finishedAt?`,
`resultBranch?`, `resultCommit?`, más los campos calculados `stats` y
`agentsUsed`, y `result?` (solo cuando está `completed`).

### Otros

- `TaskAttempt`: agente, número, fechas, status, error, `workspacePath`,
  `branchName`, `baseRef`, `commitSha`.
- `IntegrationError`: `{ type: "git_conflict", dependencyTaskIds, files?, message }`.
- `ProjectStats`: `{ total, done, running, failed, blocked, ready, todo, progress, activeAgents }`.
- `ProjectResult`: `{ projectId, status: "completed", branchName, commitSha, completedTasks, failedTasks, startedAt, finishedAt }`.
- `ChatMessage` / `ChatSummary` / `ChatDetail`.
- `ProjectPreview`: `{ projectId, status, url?, port?, command?, log?, error?, startedAt? }`.
- `StoredReview`, `SupervisorRun`, `AgentAvailability`, `ConfigInfo`, `AppInfo`.

---

## 9. Proveedores y agentes

### 9.1 Providers (cómo se invoca cada modelo)

| Provider | Implementación | Invocación |
|---|---|---|
| **Codex** | `src/providers/codex.ts` | `codex exec --sandbox workspace-write <prompt>` (CLI, sin shell). |
| **Claude** | `src/providers/claude.ts` | `claude -p <prompt>` + `--model sonnet|opus` si se indica modelo. |
| **DeepSeek** | `src/providers/deepseek.ts` | HTTP con SDK `openai` apuntando a `https://api.deepseek.com`; `chat.completions.create` con un único mensaje de usuario. Modelo por defecto `deepseek-flash`. |

Detalles de `execCli` (`src/providers/exec.ts`):

- Usa `child_process.spawn` (sin shell) y **emite stdout/stderr en vivo** por
  `RunOptions.onOutput`, acumulando hasta 10 MiB.
- Soporta `cwd` (worktree) y `AbortSignal` (cancelación).
- Tras spawn hace `stdin.end()` porque algunos CLIs (Codex) esperan EOF aunque
  el prompt vaya como argumento.
- Al fallar: `[<provider>] falló la ejecución (exit code: <code>): <stderr|stdout|message>`.
- DeepSeek **no** acepta `cwd`/`signal` ni streaming (no soporta aislamiento por
  worktree ni cancelación de proceso; se detiene al final del batch).

### 9.2 Selección de agente (`selectAgent`)

Selección determinista por `type` y `complexity` (el agente explícito
`task.agent` siempre gana, vía `resolveAgent`):

| Tipo | low | medium | high | critical |
|---|---|---|---|---|
| `architecture` | Opus | Opus | Opus | Opus |
| `planning` | Sonnet | Sonnet | Opus | Opus |
| `coding` | DeepSeek Flash | Sonnet | Codex | Codex |
| `review` | Sonnet | Sonnet | Opus | Opus |
| `testing` | DeepSeek Flash | Sonnet | Sonnet | Sonnet |
| `research` | DeepSeek Flash | Sonnet | Opus | Opus |

`describeAgent`: `codex` → `"codex"`; el resto → `"<provider> / <model>"` (p. ej.
`"claude / opus"`).

### 9.3 Cadena de fallback (`getFallbackChain`)

Cada cadena tiene **3 candidatos**. Si la tarea define `task.agent`, este se
**antepone** y la lista se deduplica por clave `provider:model`.

| Tipo | Complejidad | Cadena |
|---|---|---|
| `architecture` | todas | Opus → Codex → Sonnet |
| `planning` | high/critical | Opus → Codex → Sonnet |
| `planning` | resto | Sonnet → DeepSeek Flash → Codex |
| `review` | high/critical | Opus → Codex → Sonnet |
| `review` | resto | Sonnet → Codex → DeepSeek Flash |
| `coding` | low | DeepSeek Flash → Sonnet → Codex |
| `coding` | medium | Sonnet → Codex → DeepSeek Flash |
| `coding` | high | Codex → Sonnet → Opus |
| `coding` | critical | Codex → Opus → Sonnet |
| `testing` | low | DeepSeek Flash → Sonnet → Codex |
| `testing` | resto | Sonnet → Codex → DeepSeek Flash |
| `research` | low | DeepSeek Flash → Sonnet → Opus |
| `research` | medium | Sonnet → DeepSeek Flash → Opus |
| `research` | high/critical | Opus → Sonnet → DeepSeek Flash |

Invariante garantizada: `getFallbackChain(task)[0]` es siempre `selectAgent(task)`
(cuando no hay agente explícito).

La cadena se **restringe a los agentes permitidos** del chat/proyecto
(`restrictToAllowed`); una lista vacía significa «sin restricción». Los roles de
orquestación reutilizan estas mismas cadenas mapeando rol → tipo de tarea
(`runRoleAgent`, `src/agents/role.ts`): planner/supervisor/instrucciones →
`planning`, reviewer → `review`, grill → `research`.

### 9.4 Clasificación de errores y disponibilidad

**Retryable** (`isRetryableError`): primero descarta si aparece un patrón **no
reintentable**; si no, es reintentable solo si coincide un patrón reintentable.

- **No reintentables**: `api key`, `apikey`, `unauthorized`, `forbidden`, `401`,
  `403`, `not found`, `enoent`, `command not found`, `invalid model`,
  `unknown model`, `invalid_request`, `invalid request`, `400`.
- **Reintentables**: `timeout`, `timed out`, `etimedout`, `econnreset`,
  `econnrefused`, `enotfound`, `eai_again`, `network`, `connection`,
  `disconnected`, `socket hang up`, `rate limit`, `rate_limit`,
  `too many requests`, `429`, `500`, `502`, `503`, `504`, `internal server error`,
  `service unavailable`, `bad gateway`, `gateway timeout`, `temporarily`,
  `temporary`, `unavailable`, `overloaded`, `try again`, `terminated`, `killed`,
  `sigterm`, `sigkill`.

> Los límites de cuota/sesión (`session limit`, `usage limit`, `quota`,
> `insufficient_quota`, `out of credits`) **no** están en ninguna lista, por lo
> que se tratan como no reintentables y provocan **salto inmediato** al
> siguiente agente de la cadena.

**Reintento de cadena al agotar límites** (`src/agents/limit-retry.ts`): si
*ningún* candidato pudo ejecutar porque **todos** cayeron por límite
(`rate_limit`/`usage_limit`), `runTask` y `runRoleAgent` no se rinden: esperan
(respetando un `retry after N` del proveedor si aparece, o un backoff exponencial)
y vuelven a recorrer la cadena completa hasta `limitRetry.maxLimitRetries`. Un
fallo transitorio o de otro tipo desactiva este reintento (no se re-recorre la
cadena). La espera es cancelable con `AbortSignal`.

**Disponibilidad** (`classifyAvailability`, `src/agents/availability.ts`):
clasifica en `usage_limit | rate_limit | auth | cli_missing | network | unknown`
según orden de precedencia. Está conectada a la ejecución: cuando un proveedor
no está disponible, `runTask` y `runRoleAgent` **saltan al siguiente candidato
sin reintentarlo** (tiene prioridad sobre `isRetryableError`); si todos caen por
límite, se aplica el reintento de cadena descrito arriba. La API usa además
`checkAgentAvailability` para exponer el estado de cada proveedor a la UI.

**Disponibilidad de agentes en la API** (`src/api/availability.ts`):

- `codex --version` y `claude --version` (5 s de timeout) → conectado si el
  binario existe (aunque salga con código ≠ 0); `ENOENT` → no conectado con
  motivo `CLI "<command>" no encontrado en el PATH.`
- DeepSeek: conectado si `DEEPSEEK_API_KEY` está definida; si no, motivo
  `"DEEPSEEK_API_KEY no está definida."`

---

## 10. Planner (descomposición del objetivo)

`src/planner/planner.ts` — `planProject(goal, context?, deps?)`.

- **Agente**: se elige por complejidad y se restringe a los agentes permitidos
  del proyecto/chat, con cadena de fallback por disponibilidad (`runRoleAgent`).
- **Intentos**: `plannerMaxAttempts` (por defecto 2). En cada intento construye
  el prompt, ejecuta el agente, extrae y valida el JSON; si falla, reintenta con
  el error como feedback.
- **Prompt**: en español, incluye objetivo, plan actual, conversación, tareas ya
  completadas (no repetir), tareas fallidas, motivo del supervisor,
  instrucciones y (si aplica) el feedback del intento anterior. Termina con un
  ejemplo JSON exacto y las reglas (IDs únicos, dependencias existentes, sin
  ciclos, al menos una tarea sin dependencias).
- **Extracción JSON**: prefiere un bloque ``` ```json ... ``` ```; si no, corta
  desde el primer `{` hasta el último `}`.
- **Validación con Zod** (`generatedPlanSchema`): `summary` (string, default
  `""`) + `tasks` (array, mínimo 1). Cada tarea: `id`, `title`, `description`
  (mín. 1), `type` (enum), `complexity` (enum), `dependsOn` (string[], default
  `[]`), `acceptanceCriteria` (string[], default `[]`).
- **Validación estructural** (`validateGeneratedPlan`): no vacío, sin IDs
  duplicados, sin dependencias inexistentes, sin ciclos, sin criterios de
  verificación manual (navegador real, inspección visual) y **sin rutas
  absolutas del filesystem** (`/Users/...`, `C:\...`, `~/...`). Los criterios
  deben usar rutas relativas a la raíz del repositorio (`package.json`,
  `src/index.ts`): la tarea se ejecuta en un worktree aislado y una ruta
  absoluta apuntaría fuera de él.
- Si se agotan los intentos: lanza
  `El planner no generó un plan válido tras N intentos: <detalle>.`

**PlanContext**: `previousPlan?`, `completedTaskIds?`, `failedTaskIds?`,
`supervisorReason?`, `instructions?`, `conversation?`.

---

## 11. Scheduler (ejecución del DAG)

`src/scheduler/scheduler.ts` — `runPlan(tasks, options)`.

### Validación (`validation.ts`)

`validatePlan(tasks)` lanza si:

1. Hay **IDs duplicados**: `El plan contiene IDs duplicados: ...`
2. Hay **dependencias inexistentes**: `El plan tiene dependencias inexistentes: ...`
3. Hay **ciclos** (DFS): `El plan contiene una dependencia circular: A → B → A`

### Recálculo de estados (`dependencies.ts`)

`updateTaskStatuses(tasks)`:

- **Se preservan**: `done`, `failed`, `running`.
- **Blocked por integración** (`status: "blocked"` + `integrationError`) es
  **pegajoso** (no se recalcula).
- Sin dependencias → `ready`.
- Si alguna dependencia está `failed` → `blocked` con
  `bloqueada por <ids> (failed)`.
- Si todas las dependencias están `done` → `ready`.
- Si no → `blocked` con `esperando a <ids pendientes>`.
- `interrupted` **no** se preserva: se recalcula (normalmente a `ready`).

### Ejecución

`runPlan` es un bucle por **batches** (no un pool deslizante):

1. Resuelve `concurrency` (default 2; entero ≥ 1 o lanza) y `maxConcurrency`
   (tope; si no se define, la concurrencia es fija).
2. `validatePlan`; clona tareas; `updateTaskStatuses`; `onUpdate`.
3. Bucle:
   - Todas `done` → **`completed`**.
   - `shouldPause()` → **`paused`**.
   - `signal.aborted` → **`cancelled`**.
   - `ready = getReadyTasks()`. Si no hay ninguna: **`failed`** si hay fallos,
     si no **`blocked`**.
   - Toma `ready.slice(0, concurrency)`, las marca `running` y `onUpdate`.
   - `Promise.all` de esas tareas (cada una vía `executeTask`, con try/catch).
   - Según termina cada tarea, pliega su resultado en `current` y llama a
     `onUpdate` (progreso intermedio visible).
   - **Ajuste de concurrencia** (`nextConcurrency`): si alguna tarea del lote
     agotó sus agentes por disponibilidad (`classifyAvailability` no disponible)
     baja a la mitad (mín. 1); si el lote terminó entero `done` sube de uno en
     uno hasta `maxConcurrency`. Cada cambio se emite por `onConcurrencyChange`.
   - `updateTaskStatuses` de nuevo y siguiente batch.
4. `executeTask` por defecto es `runTask`. Una tarea que resuelve en un estado
   inesperado (ni `done`/`failed`/`blocked`) se fuerza a `failed`.

### Resultado

`PlanResult { status, tasks, startedAt, finishedAt, failedTaskIds?, blockedTaskIds? }`
con `status ∈ completed | failed | blocked | paused | cancelled`.

---

## 12. Ejecución de tareas (retries + fallback + worktrees)

`src/tasks/runner.ts` — `runTask(task, options)`.

**Precondición**: la tarea debe estar en `ready`; si no, lanza
`La tarea <id> no se puede ejecutar (estado actual: <x>). Se esperaba "ready".`

**Bucle de ejecución**:

```
para cada candidato en getFallbackChain(task):        // 3 candidatos
  para attempt en 0..maxRetriesPerAgent:              // 2 intentos por candidato
    1. crear worktree limpio desde baseRef
    2. ejecutar el agente con cwd = worktree
    3. commit del resultado en la branch del intento
    4. eliminar worktree (borrando branch si no hubo commit)
    si éxito -> tarea done con executedBy, output, resultCommit
    si el proveedor no está disponible (cuota/rate limit/auth/CLI) -> siguiente candidato
    si fallo retryable y quedan intentos -> reintentar mismo candidato
    si fallo no retryable o se agotan intentos -> siguiente candidato
si TODOS los candidatos cayeron por límite (rate/usage) -> esperar y re-recorrer
  la cadena hasta limitRetry.maxLimitRetries (retry after del proveedor o backoff)
si se agotan candidatos -> tarea failed
```

Los roles de orquestación (planner, supervisor, grill, instrucciones) usan el
mismo mecanismo vía `runRoleAgent` (`src/agents/role.ts`), sin worktrees. El
reviewer es la excepción: corre con `cwd` en el worktree del intento (dentro de
`onWorkspaceSuccess`, antes de borrarlo) para inspeccionar los archivos reales
en vez de la copia principal, que por diseño no contiene los cambios.

Detalles:

- `prompt` = prompt base de la tarea (+ `extraPrompt` de feedback del review).
- `maxRetriesPerAgent` por defecto **1** (=> hasta 2 intentos por agente).
- Guard de aislamiento: si el `cwd` del agente coincide con la raíz del repo,
  lanza `Aislamiento inválido...`.
- Cada intento registra un `TaskAttempt` (agente, nº, fechas, status, error,
  workspace, branch, baseRef, commitSha).
- Cada intento de un mismo agente parte de un worktree **limpio** desde el mismo
  punto de partida: los artefactos parciales de un intento fallido **no**
  contaminan el siguiente.
- **Ciclos de fix**: `runTask` acepta `startRef`. En el primer ciclo el worktree
  parte de `baseRef`; en los ciclos de review/fix parte del `resultCommit`
  anterior, de modo que el agente **continúa** el trabajo en vez de rehacerlo.
  Al terminar, `squash(workspace, baseRef, msg)` reaplica el árbol final como un
  único commit sobre `baseRef` (con `git reset --soft` + `commit`), para que el
  cherry-pick de la tarea siga siendo un solo commit. Si el fix no introduce
  cambios, se conserva el commit anterior.
- Si `AbortSignal` está abortado → `failed` con `Ejecución cancelada por el usuario.`
- Una tarea de tipo `coding` que no produce ningún commit (primer intento, sin
  ciclo de fix) se considera fallida: un proveedor que solo devuelve texto
  (DeepSeek) no escribe en el worktree y sin este guard el proyecto se marcaría
  `completed` sin haber creado ningún fichero. La cadena de fallback pasa
  entonces a un agente capaz de editar (Codex/Claude) o la tarea falla.

---

## 13. Reviewer y checks locales

### Checks locales (`src/checks/checks.ts`)

- `detectCheckScripts(dir)`: lee `package.json` y devuelve la intersección de
  `["typecheck", "build", "test"]` con los scripts declarados (en ese orden).
  Si no hay `package.json` o falla el parseo → `[]`.
- `ensureDependencies(dir)`: si falta `node_modules`, detecta el gestor
  (`detectPackageManager`) y ejecuta su `install`. Los checks corren en el
  worktree del agente (no en uno aparte), así que si el agente ya instaló las
  dependencias se reutilizan. Es best-effort: si falla, se avisa y se corren
  igualmente los checks.
- `runProjectChecks(dir, scripts)`: ejecuta `npm run <script>` con `execFile`;
  nunca rechaza; trunca stdout/stderr a 4000 caracteres. `build` y `test` se
  mantienen **en orden** (test puede necesitar el build); el resto (`typecheck`,
  `lint`…) corre **en paralelo** con esa cadena. Los resultados se devuelven en
  el orden original.
- `DEFAULT_CHECK_SCRIPTS = ["typecheck", "build", "test"]`.

### Reviewer LLM (`src/reviewer/reviewer.ts`)

- `reviewTask(task, context, deps)`: agente elegido por la complejidad de la
  tarea, restringido a los permitidos y con fallback (`runRoleAgent`).
- `shouldSkipReview(task, checks)`: omite el review LLM solo si la tarea es
  `low`, no tiene `acceptanceCriteria` y hay checks que existen y pasan. Si no
  hay checks, el review sigue siendo la única validación.
- **Contexto**: `diff` (del commit), `output` (del agente), `checks` (resultados
  locales), `acceptanceCriteria` (de la tarea) y `repoRoot` (para reanclar
  criterios con rutas absolutas dentro del repo a relativas).
- **`cwd`**: `ReviewerDeps.cwd` fuerza el directorio de inspección del reviewer
  por encima del que traiga el ejecutor (que apunta al repo principal). El
  ciclo review/fix lo fija al worktree del intento.
- Prompt estricto: `approved` debe ser `false` si algún criterio no se cumple o
  algún check falla.
- Salida validada con Zod: `{ approved, summary, issues[], suggestedFixes? }`.
- **Fail-safe**: si la respuesta no es parseable o el agente falla, devuelve
  `approved: false` (nunca lanza).

### Ciclo review/fix (en `projects/service.ts`)

Para cada tarea, hasta `maxReviewFixCycles + 1` iteraciones (default **3**):

1. Ejecuta la tarea (`runTask`) con el feedback acumulado. A partir del segundo
   ciclo pasa `startRef = resultCommit` anterior: el agente continúa sobre su
   propio trabajo y el resultado se aplana en un commit sobre la base.
2. Ejecuta los checks locales en el worktree del agente, antes de eliminarlo
   (callback `onWorkspaceSuccess`), reutilizando su `node_modules` si existe.
3. Obtiene el `diff` del commit.
4. Llama al reviewer.
5. **Aprobado** solo si `review.approved === true` **Y** todos los checks pasan.
6. Si no: emite `task.review_failed`, construye feedback
   (`buildFixFeedback`: issues + sugerencias + checks fallidos) y repite.
7. Si se agotan los ciclos: tarea `failed` con
   `review no aprobado tras N ciclos`.

---

## 14. Supervisor y replanificación

`src/supervisor/supervisor.ts` — `superviseProject(project, context, deps)`.

- Agente elegido por complejidad, restringido a los permitidos, con fallback.
- Decide entre: `continue`, `replan` (con `instructions?`), `pause`, `fail`.
- Prompt con objetivo, resumen del estado de tareas, estado del proyecto,
  trigger, número de fallos y aviso de conflicto de integración.
- **Fail-safe**: si la decisión no es parseable o el agente falla → `continue`
  (`supervisor no disponible: ...`). **Nunca lanza.**

### Replanificación (`mergeReplan`)

Cuando el supervisor decide `replan`:

1. El planner recibe el objetivo, las tareas completadas/fallidas, el motivo del
   supervisor y (opcional) instrucciones.
2. `mergeReplan(existing, plan)`:
   - Conserva las tareas `done` tal cual.
   - Reinicia a `todo` las demás tareas existentes (conservando sus campos).
   - Añade solo las tareas **nuevas** del plan (si un ID ya existe, gana el
     existente).
   - Valida el DAG resultante.
3. Se emite `supervisor.replan` y se continúa con la siguiente ronda.

---

## 15. Orquestación de proyecto

`src/projects/service.ts` es el núcleo. Constante `MAX_SUPERVISOR_ROUNDS = 3`.

### Ciclo principal (`runProject`)

1. Carga el proyecto y **recupera tareas `running`** a `interrupted`
   (`recoverInterrupted`).
2. Estado → `running`, `startedAt`, emite `project.started`.
3. Repite hasta **3 rondas**:
   - `runProjectRound`: ejecuta el DAG completo.
   - Si `completed` → `finalizeProjectRun`.
   - Si `paused` → estado `paused`, emite `project.paused`.
   - Si `cancelled` → estado `cancelled`, emite `project.cancelled`.
   - Cuenta fallos y detecta conflictos de integración.
   - Llama al **supervisor** y persiste su decisión.
   - `replan` → replanifica y continúa con otra ronda.
   - `pause` → `paused`; `fail` → `failed`.
   - `blocked` → sale del bucle.
4. `finalizeProjectRun`.

### Finalización (`finalizeProjectRun`)

- Si **todas** las tareas están `done`:
  - `finalizeProject` integra los commits en
    `agent/project-<id>-final` (cherry-pick).
  - Si integra: `completed`, guarda `resultBranch`/`resultCommit`, emite
    `project.completed`.
  - Si `remoteUrl` y `GITHUB_TOKEN`: intenta push y emite `project.pushed` o
    `project.push_failed`.
  - Si falla la integración: `failed` + `git.conflict`.
- Si **no** todas están `done`: `failed` si hay alguna `failed`, si no `blocked`.

### Otras operaciones de servicio

| Función | Efecto |
|---|---|
| `createProject` | Planifica y crea el proyecto en `ready`. |
| `createProjectDraft` | Crea el proyecto en `draft` **sin** planificar (usado por la API). |
| `generatePlan` | `planning` → `ready`; rechaza si está `running`/`completed`. |
| `pauseProject` | → `paused`, emite `project.paused`. |
| `cancelProject` | → `cancelled`, emite `project.cancelled`. |
| `resumeProject` | Recupera interrumpidas, → `running`, emite `project.resumed`, y ejecuta. |
| `deleteProject` | Borra el proyecto de storage (no toca disco). |
| `buildProjectResult` | Construye `ProjectResult` solo si `completed` con branch/commit/fechas. |

### Grafo LangGraph (`src/graph/graph.ts`)

Motor alternativo con `StateGraph` + `MemorySaver` y `MAX_GRAPH_ROUNDS = 6`:

```text
START → plan → run → supervise ─┬─ replan → plan
                                 ├─ continue → run
                                 ├─ pause/fail → END
                                 └─ finalize → END
```

- Nodo `plan`: solo replanifica si la decisión previa es `replan`; si no, pasa el
  proyecto sin cambios.
- Nodo `run`: ejecuta una ronda; incrementa `rounds`.
- Nodo `supervise`: si todas las tareas están `done`, decide `continue` sin
  llamar al supervisor.
- Nodo `finalize`: integra el resultado.

---

## 16. Workspace y Git

`src/workspace/manager.ts` (constante `WORKTREES_DIR = ".worktrees"`).

### Convenciones de nombres

| Propósito | Branch | Worktree |
|---|---|---|
| Intento de tarea | `agent/<taskId>-attempt-<N>` | `.worktrees/<taskId>-attempt-<N>` |
| Integración de dependencias | `integration/<taskId>` | `.worktrees/integration-<taskId>` |
| Branch final del proyecto | `agent/project-<id>-final` | `.worktrees/project-<id>-final` |

Los IDs se **sanean** (`sanitizeTaskId`): caracteres no válidos → `-`, se
colapsan `..`, se quitan prefijos/sufijos `-`/`.`; si queda vacío → `task`.

### Operaciones

- `getRepoRoot` / `resolveBaseRef`: `git rev-parse` (`--show-toplevel`, `HEAD`).
  La raíz se **memoriza por ruta** durante el proceso (se consulta muchas veces
  por tarea e intento); un fallo no se cachea. `resolveBaseRef` reutiliza la raíz
  cacheada y solo lanza `rev-parse HEAD`.
- `prepareProjectRepo(repoPath, remoteUrl?)`: crea la carpeta si no existe,
  `git init` si no es repo, commit inicial vacío si no hay HEAD
  (`chore: initial commit`, identidad `MrRobot <mrrobot@localhost>`), configura
  `origin` y verifica el remoto, y añade `.worktrees/` a `.git/info/exclude`.
- `create` / `commit` / `remove` / `diff`: ciclo de vida del worktree. `commit`
  devuelve `undefined` si no hay cambios (`git status --porcelain` vacío).
- `integrateDependencies(taskId, commits, baseRef)`: sin commits → no-op
  (`ref = baseRef`); si hay, crea `integration/<taskId>` y hace `git cherry-pick`
  de cada commit de dependencia. En éxito **conserva** la branch; en conflicto la
  **borra** y devuelve `IntegrationError`.
- `finalizeProject(projectId, commits, baseRef)`: cherry-pick de todos los
  commits en `agent/project-<id>-final`.
- `push(branchName)`: `git push --set-upstream origin <branch>` con credenciales
  de `GITHUB_TOKEN` si aplica.

### Conflictos

- Se detecta conflicto ante **cualquier** fallo de `cherry-pick` (o de creación
  del worktree de integración).
- Los archivos en conflicto se obtienen con
  `git diff --name-only --diff-filter=U`.
- La tarea queda `blocked` con `integrationError` (`type: "git_conflict"`),
  `blockedReason` y `files`.
- **El repo principal nunca se toca**: todas las operaciones ocurren en el
  worktree. Ante conflicto se hace `cherry-pick --abort`, se elimina el worktree
  y se borra la branch.

### GitHub

- `GITHUB_TOKEN` habilita autenticación HTTPS no interactiva vía
  `credential.helper`.
- Se usa `GIT_TERMINAL_PROMPT=0` para evitar prompts interactivos.
- Al crear proyecto con `remoteUrl` + token se valida con `git ls-remote`.
- Al completar, si hay `remoteUrl`, se hace push de la branch final.

---

## 17. Persistencia (storage)

Interfaz `Storage` (`src/storage/types.ts`) con dos implementaciones:
`InMemoryStorage` (mock) y `SqlStorage` (PGlite/Postgres).

### Esquema SQL (`src/storage/sql.ts`)

Tablas: `projects`, `tasks`, `task_dependencies`, `task_attempts`, `agent_runs`,
`reviews`, `supervisor_runs`, `events`, `chats`, `chat_messages`.

- `projects`: `id`, `name`, `goal`, `status`, `base_ref`, `repo_path`,
  `remote_url`, `result_branch`, `result_commit`, `config JSONB`,
  `created_at`, `updated_at`, `started_at`, `finished_at`.
- `tasks`: PK `(project_id, id)`, con `title`, `description`, `status`, `type`,
  `complexity`, `chat_id`, `blocked_reason`, `agent JSONB`, `executed_by JSONB`,
  `acceptance_criteria JSONB`, `integration_error JSONB`, `output`, `error`,
  `result_commit`, `started_at`, `finished_at`.
- `task_dependencies`: PK `(project_id, task_id, depends_on)`.
- `task_attempts`: `id`, `project_id`, `task_id`, `attempt`, `provider`, `model`,
  `status`, `error`, `workspace_path`, `branch_name`, `base_ref`, `commit_sha`,
  `started_at`, `finished_at`.
- `agent_runs`: `id`, `project_id`, `task_id`, `role`
  (`planner|worker|reviewer|supervisor`), `provider`, `model`, `status`, `error`,
  fechas.
- `reviews`: `id`, `project_id`, `task_id`, `attempt`, `approved`, `summary`,
  `issues JSONB`, `created_at`.
- `supervisor_runs`: `id`, `project_id`, `action`, `reason`, `instructions`,
  `created_at`.
- `events`: `id`, `project_id`, `type`, `task_id`, `payload JSONB`, `created_at`.
- `chats`: `id`, `project_id`, `title`, `seq`, `created_at`, `updated_at`.
- `chat_messages`: `id`, `chat_id`, `project_id`, `role`, `content`,
  `task_ids JSONB`, `agent JSONB`, `error`, `created_at`.

Migraciones en `init()`: añade columnas con `ADD COLUMN IF NOT EXISTS`
(`projects.config`, `projects.repo_path`, `projects.remote_url`,
`tasks.chat_id`).

Comportamientos clave:

- `saveProject` es un **upsert** del proyecto y **reemplaza por completo** las
  tareas, dependencias e intentos del proyecto (borra y reinserta).
- `deleteProject` borra en cascada todas las tablas relacionadas.
- PGlite es Postgres embebido (WASM); para Postgres real basta un `SqlExecutor`
  con `pg`.

---

## 18. Chats por proyecto

`src/chats/service.ts`. Un proyecto puede tener varios chats (hilos
independientes), disponibles en todos los estados salvo `running`.

### Crear chat

`createChat(projectId, {title?, message?})`:

- Rechaza si el proyecto está `running`.
- `seq = max(existing seq) + 1`; título derivado del mensaje o `Chat <seq>`.
- Emite `chat.created`.
- Si hay `message`, se envía inmediatamente (mismo flujo que enviar mensaje).

### Enviar mensaje (flujo del planner)

1. Rechaza si el proyecto está `running`; valida chat y contenido.
2. Persiste el mensaje `user` y emite `chat.message`.
3. Construye el contexto del planner: objetivo del proyecto, plan actual del
   chat, conversación e instrucciones (= el mensaje).
4. El planner devuelve un plan.
5. Los IDs del plan se **prefijan por chat** (`C1-TASK-001`, `C2-TASK-001`, …)
   para que no colisionen entre chats; las tareas se asocian con `task.chatId`.
6. `mergeChatTasks`: conserva las tareas `done` del chat, conserva las tareas de
   otros chats intactas y reemplaza el resto por el plan nuevo.
7. **Reactivación**: si el proyecto estaba `draft`/`completed`/`failed`/
   `cancelled` y el chat añade tareas pendientes, vuelve a `ready` (borrando
   `finishedAt`, `resultBranch`, `resultCommit`).
8. Guarda el mensaje `assistant` (resumen + IDs) y emite `chat.message` y
   `plan.updated`.
9. **Errores**: si el planner falla, guarda un mensaje `assistant` con el error
   (`No pude generar el plan: ...`) y **no** lanza.

Borrar un chat elimina sus tareas y mensajes (emite `chat.deleted`).

En la UI, los chats aparecen como pestaña **Chats** y en la barra lateral (con
botón `+` para crear uno nuevo); al pulsar se abre
`/projects/:id?chat=:chatId`.

---

## 19. Preview (servidor de desarrollo)

`src/preview/preview.ts` — `PreviewManager`.

- Solo para proyectos **completados** con `resultCommit`.
- Crea un worktree `preview-<id>` desde el commit final.
- Detecta el gestor de paquetes: campo `packageManager` → lockfiles
  (`pnpm-lock.yaml` → `yarn.lock` → `package-lock.json`) → `npm`.
- Elige el script de arranque entre `dev`, `start`, `preview`, `serve`.
- Si `node_modules` no existe, ejecuta la instalación
  (`npm install` / `yarn install` / `pnpm install`).
- Arranca el servidor y detecta la URL/puerto de su salida
  (`http://localhost|127.0.0.1|...:<puerto>`).
- Si no hay script pero existe `index.html`, sirve un **servidor estático**
  interno (con protección contra path traversal).
- Estados: `starting`, `installing`, `running`, `stopped`, `failed`.
- Guarda un log (máx. 200 líneas) y mata el árbol de procesos al detener.

---

## 20. Importar proyectos

`src/projects/import.ts` — `importCompletedProject(input, deps)`.

Permite reconstruir un proyecto MrRobot a partir de una **branch final** ya
existente (`agent/project-*-final`).

1. Resuelve la raíz del repo.
2. Usa la branch indicada o la primera final (ordenada por fecha de commit).
3. Obtiene `resultCommit` y deriva el `id` del nombre de la branch.
4. Rechaza si ya existe un proyecto con ese id.
5. Recorre el log (`git log --reverse`) y **reconstruye las tareas** a partir de
   los commits con asunto `agent(<taskId>): <título>` (todas en `done`, tipo
   `coding`, complejidad `low`).
6. Crea el proyecto en estado `completed` con `resultBranch`/`resultCommit`.
7. Emite `project.created`, `plan.generated`, un `task.completed` por tarea y
   `project.completed`.

`listFinalBranches(repoPath)`: lista ramas `refs/heads/agent/project-*-final`
ordenadas por fecha de commit descendente.

---

## 21. API HTTP

Capa fina en `src/api` (Node `http`, sin dependencias extra). Base:
`http://127.0.0.1:4000`. Todas las rutas cuelgan de `/api`.

### Endpoints

| Método | Ruta | Cuerpo / Query | Éxito |
|---|---|---|---|
| GET | `/api/health` | — | `200 {ok:true}` |
| GET | `/api/info` | — | `200 AppInfo` |
| PUT | `/api/config` | overrides de config | `200 ConfigInfo` |
| POST | `/api/fs/pick-folder` | — | `200 {path}` (solo macOS) |
| GET | `/api/activity` | `?limit=N` (default 100) | `200 ProjectEvent[]` |
| GET | `/api/chats` | — | `200 ChatSummary[]` (todos los proyectos) |
| GET | `/api/projects` | — | `200 ProjectSummary[]` (por `updatedAt` desc) |
| POST | `/api/projects` | `{goal, name?, repoPath?, remoteUrl?, config?}` | `201 Project` |
| POST | `/api/projects/import` | `{repoPath, branch?, name?, goal?}` | `201 Project` |
| GET | `/api/projects/import/branches` | `?repoPath=` | `200 {branches}` |
| GET | `/api/projects/:id` | — | `200 Project` |
| DELETE | `/api/projects/:id` | — | `200 {id, deleted:true}` |
| PATCH | `/api/projects/:id/config` | overrides | `200 Project` |
| POST | `/api/projects/:id/plan` | — | `202 Project` |
| POST | `/api/projects/:id/run` | — | `202 Project` |
| POST | `/api/projects/:id/pause` | — | `200 Project` |
| POST | `/api/projects/:id/resume` | — | `202 Project` |
| POST | `/api/projects/:id/cancel` | — | `200 Project` |
| GET | `/api/projects/:id/tasks` | — | `200 Task[]` |
| GET | `/api/projects/:id/events` | — | `200 ProjectEvent[]` (asc) |
| GET | `/api/projects/:id/reviews` | — | `200 StoredReview[]` |
| GET | `/api/projects/:id/supervisor` | — | `200 SupervisorRun[]` |
| GET | `/api/projects/:id/chats` | — | `200 ChatSummary[]` |
| POST | `/api/projects/:id/chats` | `{title?, message?}` | `201 ChatDetail` |
| GET | `/api/projects/:id/chats/:chatId` | — | `200 ChatDetail` |
| DELETE | `/api/projects/:id/chats/:chatId` | — | `200 {id, deleted:true}` |
| POST | `/api/projects/:id/chats/:chatId/messages` | `{content}` | `200 ChatDetail` |
| GET | `/api/projects/:id/preview` | — | `200 ProjectPreview` |
| POST | `/api/projects/:id/preview` | — | `202 ProjectPreview` |
| DELETE | `/api/projects/:id/preview` | — | `200 ProjectPreview` |
| GET | `/api/projects/:id/stream` | — | `200 text/event-stream` (SSE) |
| POST | `/api/projects/:id/tasks` | tarea nueva | `200 Project` |
| PATCH | `/api/projects/:id/tasks/:taskId` | patch de tarea | `200 Project` |
| DELETE | `/api/projects/:id/tasks/:taskId` | — | `200 Project` |
| POST | `/api/projects/:id/tasks/:taskId/instructions` | `{instructions}` | `200 TaskInstructionOutcome` |

### Detalles de comportamiento

- **CORS**: `Access-Control-Allow-Origin: *`; `OPTIONS` → `204`.
- **Body**: máximo 1 MiB; JSON inválido → error.
- **Plan/run/resume**: lanzan la ejecución **en segundo plano** y responden
  `202` con el proyecto; los errores se emiten como `project.error`.
- **Edición de tareas**: solo en estados `draft`/`ready`; valida el DAG.
- **Instrucciones a una tarea** (`POST .../tasks/:taskId/instructions`): solo
  para tareas `failed`/`blocked`; pregunta al agente de la tarea, que responde
  `proceed` (cambia la aproximación) o `ask` (pide aclaraciones al usuario), y
  registra el intercambio como `task.instruction` / `task.instruction_reply`.
- **Edición de config**: solo en `draft`/`ready`/`paused`.
- **Pause**: cooperativo a nivel de batch (las tareas en curso terminan).
- **Cancel**: aborta los procesos CLI en curso (`AbortSignal`); DeepSeek se
  detiene al final del batch.
- **Delete**: no permite borrar un proyecto en ejecución; no toca el disco.

### Runtime (`src/api/runtime.ts`)

- Crea storage (PGlite o memoria), workspace (Git o mock) y config.
- Mantiene `activeRuns`, `pauseFlags` y `cancelControllers` por proyecto.
- Envuelve el storage en un `Proxy` que **emite cada evento** al bus (SSE).
- `depsFor(projectId)` usa un workspace ligado a `project.repoPath` si existe.
- `info()` expone `repoRoot`, `baseRef`, `mock`, disponibilidad de agentes y
  config.
- `shutdown()` detiene previews y cierra storage.

### Serialización (`src/api/serialize.ts`)

Convierte dominio → wire: `serializeProject`, `serializeSummary`,
`serializeTask`, `serializeEvent`, `serializeReview`, `serializeSupervisorRun`,
`serializeChatSummary/Detail`, `serializeAgent`, `describeAgent`.
`computeStats` calcula `ProjectStats` (progreso = `done/total`; `activeAgents` =
running; `blocked` + `interrupted` cuentan como `blocked`).

---

## 22. Tiempo real (SSE)

- Endpoint: `GET /api/projects/:id/stream` (`text/event-stream`).
- Al conectar emite `{type:"connected", projectId}`.
- Cada evento del event log se emite como mensaje SSE; el runtime filtra por
  `projectId`.
- Heartbeat `: ping` cada 15 s.
- La UI (`useProject`) se suscribe y, ante cada mensaje, hace un **reload
  debounced (60 ms)** de proyecto + eventos + reviews + supervisor + chats.
- El backend es la **única fuente de verdad**: un `F5` reconstruye el estado
  desde persistencia.

---

## 23. CLI

`npm run mrrobot -- <comando>`. Datos en `MRROBOT_DATA_DIR` (default
`.mrrobot/data`, PGlite).

```bash
mrrobot create "<objetivo>" [--folder <ruta>] [--remote <url>]
mrrobot import [--folder <ruta>] [--branch <rama>] [--name <nombre>] [--goal <texto>]
mrrobot plan <project-id>
mrrobot run <project-id>
mrrobot status <project-id>
mrrobot tasks <project-id>
mrrobot pause <project-id>
mrrobot resume <project-id>
mrrobot delete <project-id>
mrrobot help
```

Ejemplos:

```bash
npm run mrrobot -- create "Crear una librería TypeScript con sum(a,b), tests y README"
npm run mrrobot -- create "Calculadora web" --folder ~/proyectos/calc --remote https://github.com/acme/calc.git
npm run mrrobot -- plan <project-id>
npm run mrrobot -- run <project-id>
npm run mrrobot -- status <project-id>
```

Notas:

- `create` con `--folder` prepara/crea el repo (`prepareProjectRepo`).
- `import` sin `--folder` usa el `cwd`.
- `run`/`resume` usan el `repoPath` del proyecto si lo tiene.
- `delete` borra de la app; **no** toca el directorio en disco.

---

## 24. Interfaz gráfica (UI)

Next.js (App Router) + TypeScript + React + Tailwind, en `ui/`.

### Pantallas

| Ruta | Pantalla | Contenido |
|---|---|---|
| `/` | **Projects** | Dashboard con tarjetas (estado, progreso, agentes activos), acciones Import / New Project, borrado con confirmación. |
| `/projects/new` | **New Project** | Formulario: nombre, objetivo, carpeta (Examinar…), remoto GitHub y ajustes avanzados. |
| `/projects/:id` | **Project workspace** | Estado, acciones contextuales, plan/tablero/grafo/actividad/chats y resultado. |
| `/agents` | **Agents** | Disponibilidad de proveedores + ejecuciones activas. |
| `/activity` | **Activity** | Actividad global reciente (polling 5 s). |
| `/settings` | **Settings** | Config global de ejecución (concurrency, retries, ciclos, modelos). |

### Barra lateral (`AppShell`)

- Navegación: Projects, Agents, Activity; pie con Settings y selector de tema
  (System / Light / Dark).
- Sección "Projects & chats": hasta 5 proyectos recientes, cada uno con sus
  chats (hasta 8) y un botón `+` para crear un chat nuevo. El `+` está
  **deshabilitado** mientras el proyecto está `running`.
- Al pulsar un chat se abre `/projects/:id?chat=<chatId>`.

### Componentes principales del proyecto

| Componente | Función |
|---|---|
| `ProjectWorkspace` | Orquesta cabecera, acciones y pestañas según estado. |
| `PlanningState` | Spinner durante `planning`. |
| `PlanView` | Editor del plan en `ready` (Lista / Grafo + añadir tarea). |
| `DagView` | Grafo interactivo (`@xyflow/react`) con layout por niveles. |
| `TaskTable` | Tabla de tareas (ID, tipo, complejidad, agente, dependencias, estado). |
| `TaskDetail` | Cajón lateral con detalle, intentos, review y git. |
| `TaskEditor` | Modal de creación/edición de tarea. |
| `ExecutionView` | Tablero kanban (Running/Ready/Blocked/Failed). |
| `AgentsPanel` | Agentes activos y completados durante la ejecución. |
| `ActivityLog` | Event log con filtros (All/Tasks/Reviews/Git/System). |
| `ChatsPanel` | Lista + conversación de chats; genera/ajusta tareas. |
| `ResultView` | Resumen final: tareas, duración, branch, commit, agentes, issues. |
| `PreviewPanel` | Arranca/detiene el preview y muestra la URL y el log. |
| `SupervisorBanner` | Muestra decisiones del supervisor (replan/pause/fail). |
| `ProjectSettingsDialog` | Config por proyecto (draft/ready/paused). |
| `ImportProjectDialog` | Importar proyecto desde una branch final. |
| `CreateProjectForm` | Formulario de creación + ajustes avanzados. |

### Actualización en vivo

1. **SSE por proyecto**: `useProject` → reload debounced.
2. **Pub/sub en memoria** (`project-store`): refresca dashboard y sidebar tras
   crear/borrar chats o mensajes.
3. **Focus/visibility**: `useProjects`/`useAllChats` recargan al volver a la
   pestaña.
4. **Polling de actividad**: cada 5 s.
5. **Polling de preview**: cada 1,5 s mientras está activo.

### Flujo de usuario principal

```text
Create → Plan → Run → Monitor → Complete
```

### Tests de UI

```bash
cd ui
npm test       # tests de componentes (Vitest + Testing Library)
npm run e2e    # E2E (Playwright) contra backend mock
```

El E2E arranca el backend en modo mock y la app Next, y recorre el flujo
completo (crear → plan → ejecutar → completado) sin usar modelos reales.

---

## 25. Máquinas de estado

### Estado de Project

```text
draft → planning → ready → running → paused | blocked | completed | failed | cancelled
```

- **Creación**: `ready` (con plan) o `draft` (sin plan, vía API/UI).
- **`planning`**: mientras el planner genera el DAG.
- **`ready`**: plan listo, editable; se puede lanzar la ejecución.
- **`running`**: ejecutando rondas.
- **`paused`**: pausa cooperativa; reanudable.
- **`blocked`**: sin tareas ejecutables (dependencias/conflictos).
- **`completed`**: todas las tareas `done` e integradas en la branch final.
- **`failed`**: hay tareas fallidas o falló la integración final.
- **`cancelled`**: cancelado por el usuario.

Transiciones relevantes:

| Desde | Acción | Hasta |
|---|---|---|
| `draft`/`ready`/`paused`/`failed`/`blocked`/`cancelled` | `generatePlan` | `planning` → `ready` |
| `ready` | `run` | `running` |
| `running` | `pause` | `paused` |
| `paused` | `resume` | `running` |
| `running`/`paused` | `cancel` | `cancelled` |
| `running` | fin sin fallos | `completed` |
| `running` | fin con fallos | `failed` |
| `running` | fin sin ready ni fallos | `blocked` |
| `draft`/`completed`/`failed`/`cancelled` | chat con tareas pendientes | `ready` |

### Estado de Task

```text
todo → blocked → ready → running → done | failed
                     ↑         ↓
                  interrupted (tras crash)
```

- **`todo`**: recién creada.
- **`blocked`**: depende de tareas no `done` o conflicto de integración
  (pegajoso).
- **`ready`**: dependencias satisfechas, ejecutable.
- **`running`**: en ejecución.
- **`interrupted`**: quedó `running` tras un crash; se recupera a `ready`.
- **`done`**: ejecutada y aprobada (review + checks).
- **`failed`**: falló tras agotar retries/fallbacks o ciclos de review.

---

## 26. Event log

Eventos emitidos por el motor (persistidos y retransmitidos por SSE):

```text
project.created          project.started         project.paused
project.resumed          project.recovered       project.completed
project.cancelled        project.error           project.deleted
project.config_updated
project.pushed           project.push_failed
plan.started             plan.generated          plan.updated
task.started             task.completed          task.failed
task.review_passed       task.review_failed
task.instruction         task.instruction_reply
git.conflict             supervisor.replan
chat.created             chat.message            chat.deleted
```

Además, `task.output` es **efímero**: solo va al bus/SSE (no se persiste) y
transporta la salida del agente en vivo, agrupada cada ~400 ms. La UI la acumula
por tarea sin recargar el proyecto.

Categorías en la UI: **Tasks**, **Reviews**, **Git**, **System**.

---

## 27. Modo mock

Con `MRROBOT_MOCK=1` se simulan agentes, planner, reviewer, supervisor,
worktrees y storage (en memoria), de forma determinista y sin gastar tokens.

Escenarios (`MRROBOT_MOCK_SCENARIO`):

| Escenario | Comportamiento |
|---|---|
| `success` (default) | Planner devuelve el plan base; los workers completan; reviewer aprueba; supervisor continúa. El proyecto **completa**. |
| `replan` | Los primeros intentos de worker fallan para forzar un replan; el planner devuelve un plan ampliado (añade `TASK-005` CI) en su segunda llamada; el supervisor pide `replan`. |
| `fail` | Todos los workers fallan; el supervisor decide `fail`. El proyecto **falla**. |

- Plan base: 4 tareas (`TASK-001` Scaffold, `TASK-002` Implementar `sum`,
  `TASK-003` Tests, `TASK-004` README).
- `MRROBOT_MOCK_DELAY_MS` añade latencia artificial por ejecución de agente.

---

## 28. Todos los flujos posibles

### 28.1 Flujo principal (UI, de cero a completado)

1. **Crear**: `/projects/new` → nombre + objetivo (+ carpeta/remoto/avanzado) →
   `POST /api/projects` (draft) → `POST /api/projects/:id/plan` → navegar.
2. **Planificar**: estado `planning`; el planner genera y valida el DAG →
   `ready`. La UI lo muestra en Lista/Grafo.
3. **Revisar/editar** (opcional, solo `ready`): añadir/editar/borrar tareas
   (`POST/PATCH/DELETE .../tasks`), ajustar config
   (`PATCH .../config`), o iterar por chat.
4. **Ejecutar**: `Start project` → confirmación → `POST .../run` → `running`.
5. **Monitorizar**: tablero, grafo, actividad y chats en vivo (SSE);
   `Pause`/`Resume`/`Cancel` según estado; banners del supervisor.
6. **Finalizar**: `completed` (o `failed`/`blocked`) con branch y commit final;
   `ResultView` con agentes usados e issues.
7. **Preview** (opcional): `POST/GET/DELETE .../preview` para levantar el dev
   server del resultado.
8. **Integrar** (manual, fuera del motor): el usuario decide si hacer merge de
   `agent/project-<id>-final` a `main`.

### 28.2 Flujo con revisión fallida y corrección

1. Un worker completa una tarea, pero el reviewer o un check la rechaza.
2. Se emite `task.review_failed`; el motor reintenta con feedback del review.
3. Hasta `maxReviewFixCycles + 1` ciclos.
4. Si aprueba → `task.completed`; si no → `task.failed`.

### 28.3 Flujo con fallback de agente

1. El agente preferido falla (error transitorio) → reintento del mismo agente
   (`maxRetriesPerAgent`). Si el proveedor no está disponible (cuota, rate limit,
   auth o CLI ausente) se salta directamente al siguiente.
2. Si sigue fallando o el error es no reintentable (p. ej. cuota/`401`) → salta
   al siguiente agente de la cadena.
3. Cada intento parte de un worktree limpio.
4. Si **todos** los candidatos caen por límite (rate/usage) → se espera (retry
   after o backoff) y se re-recorre la cadena hasta `limitRetry.maxLimitRetries`.
5. Si se agotan los candidatos (o los reintentos de límite) → `task.failed`.

### 28.4 Flujo de replanificación

1. Termina una ronda con fallos.
2. El supervisor decide `replan` (con instrucciones opcionales).
3. El planner genera un plan nuevo con contexto de tareas completadas/fallidas.
4. `mergeReplan` conserva las `done`, reinicia el resto y añade lo nuevo.
5. Continúa la siguiente ronda (hasta 3 en `service`, 6 en el grafo).

### 28.5 Flujo con conflicto de integración

1. Una tarea depende de commits de otras.
2. `integrateDependencies` hace cherry-pick y hay conflicto.
3. Se emite `git.conflict`; la tarea queda `blocked` con `integrationError` y
   `files`.
4. El supervisor puede replanificar; el repo principal queda intacto.

### 28.6 Flujo de pausa/reanudación

1. `Pause` durante `running` marca un flag; el scheduler termina el batch actual
   y no lanza nuevas tareas → `paused`.
2. `Resume` recupera tareas `interrupted` a `ready` y continúa desde el estado
   persistido.

### 28.7 Flujo de cancelación

1. `Cancel` activa el `AbortController`; se matan los procesos CLI en curso.
2. DeepSeek (HTTP) se detiene al final del batch.
3. Estado → `cancelled`.

### 28.8 Flujo de crash / recuperación

1. Si el proceso muere con tareas `running`, al reanudar se marcan como
   `interrupted` (`recoverInterrupted`).
2. El scheduler las recalcula (normalmente a `ready`) y se reintentan.
3. Un `F5` en la UI reconstruye el estado desde persistencia.

### 28.9 Flujo de chat (iteración sobre el plan)

1. Crear chat (pestaña Chats o `+` de la barra lateral).
2. Enviar un mensaje en lenguaje natural.
3. El planner genera un plan; los IDs se prefijan por chat; se fusionan tareas
   (conservando las `done` y las de otros chats).
4. Si el proyecto estaba terminado, vuelve a `ready` para relanzar.
5. Borrar el chat elimina sus tareas y mensajes.

### 28.10 Flujo de importación

1. Dashboard → `Import` → elegir carpeta y branch final (`agent/project-*-final`).
2. `POST /api/projects/import`.
3. Se reconstruyen las tareas desde los commits y el proyecto queda `completed`.

### 28.11 Flujo de preview

1. Proyecto `completed` → `ResultView` → `Abrir preview`.
2. Se crea un worktree del commit final, se instala (si hace falta) y se
   arranca el dev server.
3. La UI muestra la URL y el log; `Detener` lo apaga.

### 28.12 Flujo CLI

1. `create` → planifica y crea.
2. `plan`/`tasks` → inspeccionar.
3. `run` → ejecutar (bloqueante, imprime el estado).
4. `status` → ver estado.
5. `pause`/`resume`/`delete`.

### 28.13 Flujo con push a GitHub

1. Proyecto con `remoteUrl` y `GITHUB_TOKEN` definido.
2. Al crear: se valida el acceso (`git ls-remote`).
3. Al completar: push de `agent/project-<id>-final` al remoto.
4. Se emite `project.pushed` (o `project.push_failed` sin cambiar el estado).

---

## 29. Errores y códigos HTTP

La API mapea errores de dominio a códigos según el mensaje:

- `ProjectNotFoundError` → **404**.
- Mensajes de conflicto (`/ya se está|Solo se puede|No se puede/`) → **409**.
- Mensajes de bad request (`/inválido|obligatorio|desconocido|debe ser|no vacío|no se enviaron|requiere|No se puede/`) → **400**.
- Cualquier otro → **500**.

Mensajes destacados:

| Mensaje | Situación |
|---|---|
| `El objetivo del proyecto es obligatorio.` | `goal` vacío. |
| `No se puede generar el plan en estado X.` | Plan en `running`/`completed`. |
| `No se puede ejecutar en estado X. Genera y revisa el plan primero.` | Run sin `ready`. |
| `El proyecto ya se está ejecutando.` | Run/resume concurrente. |
| `Solo se puede reanudar un proyecto pausado (estado actual: X).` | Resume inválido. |
| `No se puede borrar un proyecto en ejecución. Cancélalo primero.` | Delete activo. |
| `No se puede editar la configuración en estado X...` | Config fuera de `draft/ready/paused`. |
| `El plan no es editable en estado X...` | Editar plan fuera de `draft/ready`. |
| `No se pudo acceder al repositorio Git: ...` | Repo inválido. |
| `No se encontró ninguna rama final (agent/project-*-final) en el repositorio.` | Import sin branches. |
| `Ya existe un proyecto con id X.` | Import duplicado. |
| `Aislamiento inválido: el cwd del agente no puede ser la raíz del repositorio.` | Guard de seguridad. |
| `[deepseek] falta DEEPSEEK_API_KEY (defínela en el archivo .env).` | Sin clave. |
| `CLI "<command>" no encontrado en el PATH.` | CLI ausente. |
| `Cuerpo de petición demasiado grande.` | Body > 1 MiB. |
| `JSON inválido en el cuerpo de la petición.` | Body malformado. |
| `El selector nativo de carpetas solo está disponible en macOS.` | `pick-folder` en otro SO. |

---

## 30. Tests

### Backend

```bash
npm test          # tsx --test src/**/*.test.ts
npm run typecheck
```

Cubren: agents (selector, fallback), workspace (manager), scheduler
(dependencias, paralelismo, validación), storage, planner, reviewer, supervisor,
projects (service, config-editor, import), chats, graph, api, preview.

### UI

```bash
cd ui
npm test          # Vitest + Testing Library
npm run e2e       # Playwright (backend mock)
```

E2E (`e2e/project.spec.ts`): flujo completo crear → plan → ejecutar →
completado, y recarga durante la ejecución para verificar la reconstrucción del
estado.

---

## 31. Limitaciones actuales

- **Postgres real**: solo PGlite está implementado/verificado; el adaptador `pg`
  y Drizzle quedan pendientes.
- **Checkpointing LangGraph**: usa `MemorySaver` (memoria). La reanudación entre
  procesos se apoya en el estado persistido + rondas idempotentes; falta un
  checkpoint saver en Postgres.
- **E2E**: los tests usan agentes mockeados (deterministas); no se ha ejecutado
  un smoke run real completo (Claude limitado por suscripción).
- **Merge final**: no automático; el usuario decide si integrar la branch.
- **`concurrency`** es en proceso (no distribuida).
- **Pause**: cooperativo a nivel de batch; las tareas en curso terminan.
- **Cancel**: coopera con `AbortSignal` para matar los procesos CLI; DeepSeek
  (HTTP) se detiene al final del batch actual.
- **Activity global**: la página global usa polling ligero (5 s); el stream en
  tiempo real es por proyecto (SSE).
- **DeepSeek** no soporta `cwd`/`signal` (sin aislamiento por worktree ni
  cancelación de proceso).

---

*Documento generado a partir del código fuente en `src/`, `shared/` y `ui/`.*
