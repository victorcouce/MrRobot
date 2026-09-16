# MrRobot — orquestador multiagente

Motor multiagente en TypeScript que recibe un objetivo de alto nivel, lo
descompone en un DAG de tareas, las ejecuta con Codex / Claude / DeepSeek en
Git worktrees aislados, revisa el resultado y deja el trabajo en una branch
Git aislada.

## Arquitectura

```text
UI (ui/ — Next.js App Router)
 ↓  HTTP + SSE
API (src/api — capa HTTP fina)
 ↓
Project service (src/projects)
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

La UI nunca llama directamente a Codex/Claude/DeepSeek, Git, worktrees ni a
PostgreSQL. Toda interacción pasa por la API HTTP (`src/api`), que delega en los
servicios existentes. Los tipos del wire se comparten en `shared/types.ts`.

- `providers/`: ejecutan los CLIs/API. `runCodex`, `runClaude`, `runDeepSeek`.
- `agents/`: `selectAgent` (selector por tipo/complejidad), `getFallbackChain`
  (cadena de fallback), `isRetryableError`, `classifyAvailability`, `runAgent`.
- `tasks/`: `runTask` ejecuta una tarea con retries por agente y fallback entre
  agentes, cada intento en un worktree limpio, y commitea el resultado.
- `scheduler/`: valida el DAG (IDs, dependencias, ciclos) y ejecuta en paralelo
  con límite de concurrencia, respetando dependencias.
- `workspace/`: worktrees, commits, cherry-pick de dependencias y branch final.
- `planner/`, `reviewer/`, `supervisor/`: agentes LLM con salida validada por Zod.
- `projects/`: entidad Project y orquestación (crear/ejecutar/pausar/reanudar).
- `storage/`: persistencia (PGlite) + event log.
- `graph/`: grafo LangGraph que orquesta planner/scheduler/supervisor.

## Cómo iniciar

```bash
npm install
npm test          # tests del motor
npm run mrrobot help
```

### Backend (API HTTP)

```bash
npm run api       # levanta la API en http://127.0.0.1:4000
```

### Interfaz gráfica (UI)

```bash
cd ui
npm install
npm run dev       # Next.js en http://localhost:3000
```

La UI habla con la API a través de `NEXT_PUBLIC_API_URL` (por defecto
`http://127.0.0.1:4000`). Para desarrollo, arranca ambos procesos:

```bash
npm run api            # terminal 1
cd ui && npm run dev   # terminal 2
```

### Modo mock (sin modelos reales ni Git)

Para probar el flujo completo sin gastar tokens ni tocar Git:

```bash
MRROBOT_MOCK=1 npm run api
```

Los agentes, el planner, el reviewer, el supervisor y los worktrees se
simulan de forma determinista. Escenarios disponibles vía
`MRROBOT_MOCK_SCENARIO`: `success` (por defecto), `replan` y `fail`.

## Configuración

Central en `src/config/index.ts` (`loadConfig`):

```ts
{
  concurrency: 2,
  maxRetriesPerAgent: 1,
  maxReviewFixCycles: 2,
  plannerMaxAttempts: 2,
  plannerAgent: { provider: "claude", model: "opus" },
  reviewerAgent: { provider: "claude", model: "opus" },
  supervisorAgent: { provider: "claude", model: "opus" },
  checks: { commands: [] }, // [] => autodetecta scripts npm
}
```

## Variables de entorno

```env
DEEPSEEK_API_KEY=...       # requerido por el provider DeepSeek
MRROBOT_DATA_DIR=.mrrobot/data   # opcional, directorio de datos PGlite
MRROBOT_PORT=4000          # puerto de la API
MRROBOT_HOST=127.0.0.1     # host de la API
MRROBOT_REPO=...           # opcional, directorio del repositorio Git
MRROBOT_MOCK=1             # modo mock (agentes y git simulados)
MRROBOT_MOCK_SCENARIO=success|replan|fail
MRROBOT_MOCK_DELAY_MS=0    # retardo artificial por ejecución de agente
```

## PostgreSQL

La persistencia usa **PGlite** (Postgres embebido en WASM) a través de un
`SqlExecutor` genérico, por lo que el mismo SQL funciona sobre `pg`. El esquema
(`src/storage/sql.ts`) define: `projects`, `tasks`, `task_dependencies`,
`task_attempts`, `agent_runs`, `reviews`, `supervisor_runs`, `events`.

Para Postgres real basta añadir un `SqlExecutor` con `pg` y usar `SqlStorage`.

## Comandos CLI

```bash
npm run mrrobot -- create "Crear una librería TypeScript con sum(a,b), tests y README"
npm run mrrobot -- plan <project-id>
npm run mrrobot -- run <project-id>
npm run mrrobot -- status <project-id>
npm run mrrobot -- tasks <project-id>
npm run mrrobot -- pause <project-id>
npm run mrrobot -- resume <project-id>
```

## Estados de Project

`draft → planning → ready → running → paused | blocked | completed | failed | cancelled`

## Estados de Task

`todo → blocked → ready → running → interrupted | done | failed`

- `blocked`: depende de tareas no completadas o hay un conflicto de integración.
- `interrupted`: quedó `running` tras un crash; se recupera a `ready`.

## Fallback

`getFallbackChain(task)` devuelve una lista ordenada de candidatos según
`type`/`complexity`. Si un agente falla, se reintenta (si el error es
retryable) y luego se pasa al siguiente. Un agente explícito (`task.agent`)
va primero. Cada intento parte de un worktree limpio.

## Review

Tras completar una tarea: se ejecutan los checks locales (`npm run
typecheck|build|test`) y un reviewer LLM valida contra los `acceptanceCriteria`.
Si rechaza, la tarea se reintenta con el feedback del review hasta
`maxReviewFixCycles`; después queda `failed`.

## Replanificación

Tras cada ronda, el supervisor decide `continue | replan | pause | fail`. Con
`replan`, el planner recibe el objetivo, las tareas completadas/fallidas y el
motivo, y devuelve un DAG nuevo validado; las tareas `done` se conservan y las
restantes se reintentan.

## Git

- Cada intento: branch `agent/<task>-attempt-N` y worktree `.worktrees/...`.
- Dependencias: `integration/<task>` con `git cherry-pick` de los commits de las
  dependencias. Si hay conflicto, la tarea queda `blocked` con `integrationError`
  (`type: "git_conflict"`), sin tocar el repo principal.
- Resultado final: branch aislada `agent/project-<id>-final`. **Nunca** se hace
  merge a `main`/`master` ni operaciones destructivas sobre el repo principal.

## Event log

`project.created`, `plan.started`, `plan.generated`, `plan.updated`,
`task.started`, `task.completed`, `task.failed`, `task.review_passed`,
`task.review_failed`, `git.conflict`, `supervisor.replan`, `project.paused`,
`project.resumed`, `project.completed`, `project.cancelled`, `project.error`.

## API HTTP

Capa fina en `src/api` (Node `http`, sin dependencias extra). Endpoints:

```text
GET    /api/info                       info del backend, agentes, config
PUT    /api/config                     actualiza la config global
GET    /api/projects                   lista proyectos (resumen)
POST   /api/projects                   crea un proyecto (draft)
GET    /api/projects/:id               proyecto completo + stats
POST   /api/projects/:id/plan          genera el plan (asíncrono)
POST   /api/projects/:id/run           inicia la ejecución (asíncrono)
POST   /api/projects/:id/pause         pausa (se detiene al final del batch)
POST   /api/projects/:id/resume        reanuda desde el estado persistido
POST   /api/projects/:id/cancel        cancela (mata los procesos CLI en curso)
GET    /api/projects/:id/tasks         tareas del proyecto
GET    /api/projects/:id/events        event log
GET    /api/projects/:id/reviews       reviews almacenadas
GET    /api/projects/:id/supervisor    intervenciones del supervisor
GET    /api/projects/:id/stream        SSE de eventos del proyecto
POST   /api/projects/:id/tasks         añade tarea (antes de ejecutar)
PATCH  /api/projects/:id/tasks/:taskId edita tarea (antes de ejecutar)
DELETE /api/projects/:id/tasks/:taskId elimina tarea (antes de ejecutar)
GET    /api/activity                   actividad global reciente
```

Los route handlers no contienen lógica de dominio: delegan en
`projects/service.ts` y `projects/plan-editor.ts`. La edición del plan valida
el DAG (IDs, dependencias, ciclos) y se limita a los estados `draft`/`ready`.

## Tiempo real (SSE)

La UI se suscribe a `GET /api/projects/:id/stream`. Cada evento del event log
se emite como mensaje SSE; la UI invalida y vuelve a pedir el estado del
proyecto. El backend es la única fuente de verdad: un `F5` durante la ejecución
reconstruye el estado desde persistencia.

## Interfaz gráfica

Next.js (App Router) + TypeScript + React + Tailwind CSS, en `ui/`. Estructura:

```text
ui/src/
  app/                      pages (dashboard, new, [id], agents, activity, settings)
  components/
    layout/                 AppShell, Sidebar, ThemeToggle
    ui/                     primitivas (Button, Badge, Dialog, Tabs, …)
    projects/               ProjectCard, PlanView, DagView, TaskTable,
                            TaskDetail, TaskEditor, ExecutionView, ActivityLog, …
  lib/                      cliente API, hooks, SSE, status, theme
```

Pantallas:

- **Projects**: dashboard con proyectos recientes, estado, progreso y agentes activos.
- **New Project**: objetivo + ajustes avanzados (concurrency, modelos, retries).
- **Plan**: revisar el DAG en modo Lista o Grafo, editar tareas y validar.
- **Execution**: tablero de tareas (Running/Ready/Blocked/Failed), agentes activos,
  event log en vivo, fallbacks y revisiones visibles, pause/resume.
- **Completed/Failed**: resumen con branch/commit final y agentes usados.

Flujo de usuario:

```text
Create → Plan → Run → Monitor → Complete
```

La UI no fusiona nada a `main`: el resultado queda en una branch aislada.

### Tests de UI

```bash
cd ui
npm test           # tests de componentes (Vitest + Testing Library)
npm run e2e        # E2E (Playwright) contra backend mock
```

El E2E arranca el backend en modo mock y la app Next, y recorre el flujo
completo (crear → plan → ejecutar → completado) sin usar modelos reales.



## Limitaciones actuales

- **Postgres real**: solo PGlite está implementado/verificado; el adaptador `pg`
  y Drizzle quedan pendientes.
- **Checkpointing LangGraph**: usa `MemorySaver` (memoria). La reanudación entre
  procesos se apoya en el estado persistido + rondas idempotentes; un
  checkpoint saver en Postgres queda pendiente.
- **E2E**: los tests usan agentes mockeados (deterministas). No se ha ejecutado
  un smoke run real completo (Claude está limitado por suscripción).
- **Merge final**: no automático; el usuario decide si integrar la branch.
- `concurrency` es en proceso.
- **Pause**: cooperativo a nivel de batch; las tareas en curso terminan y no se
  lanzan nuevas.
- **Cancel**: coopera con `AbortSignal` para matar los procesos CLI (codex/claude)
  en curso; DeepSeek (HTTP) se detiene al final del batch actual.
- **Activity global**: la página global de actividad usa polling ligero (5s);
  el stream en tiempo real es por proyecto (SSE).
