# MrRobot — orquestador multiagente

Motor multiagente en TypeScript que recibe un objetivo de alto nivel, lo
descompone en un DAG de tareas, las ejecuta con Codex / Claude / DeepSeek en
Git worktrees aislados, revisa el resultado y deja el trabajo en una branch
Git aislada.

## Arquitectura

```text
CLI (src/cli)
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
npm test          # tests
npm run mrrobot help
```

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

`draft → planning → ready → running → paused | blocked | completed | failed`

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

`project.created`, `plan.generated`, `task.started`, `task.completed`,
`task.failed`, `task.review_passed`, `task.review_failed`, `git.conflict`,
`supervisor.replan`, `project.paused`, `project.completed`, `project.resumed`.

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
