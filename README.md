# MrRobot — orquestador multiagente

Motor multiagente en TypeScript que recibe un objetivo de alto nivel, lo
descompone en un DAG de tareas, las ejecuta con Codex / Claude / DeepSeek en
Git worktrees aislados, revisa el resultado y deja el trabajo en una branch
Git aislada.

> **No necesitas contratar tokens ni una API de pago aparte.** Codex y Claude
> usan tu **suscripción normal** de ChatGPT / Claude (Plus, Pro, etc.). Y si un
> proveedor agota su cuota o alcanza su límite, el motor **pasa automáticamente
> al siguiente modelo configurado** (cadena de fallback).

## Requisitos previos

Básicos:

- **Node.js 20+** y **npm**
- **git**

Para ejecutar tareas reales (no en modo mock), el motor invoca los CLIs
`codex` y `claude` directamente, así que deben estar instalados y en el
`PATH`, y autenticados una vez:

- **Codex CLI** — provider `codex` (tareas de código complejas):
  ```bash
  npm install -g @openai/codex
  codex login
  ```
- **Claude Code CLI** — provider `claude` (planner, reviewer, supervisor y
  tareas):
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude          # la primera vez abre el flujo de autenticación
  ```
- **DeepSeek** — provider `deepseek` vía HTTP; no necesita CLI, sólo la
  variable `DEEPSEEK_API_KEY` (ver [Configurar las claves](#configurar-las-claves-solo-para-uso-real)).

> **Nota:** no hace falta contratar tokens ni una API de pago aparte. Codex y
> Claude se autentican con tu **suscripción normal** de ChatGPT / Claude (Plus,
> Pro, etc.) y usan esa cuota. El único proveedor que necesita una clave de API
> es DeepSeek.
>
> Cuando un proveedor agota su cuota o alcanza su límite (rate limit, sesión,
> etc.), el motor **pasa automáticamente al siguiente modelo configurado** de la
> cadena de fallback (ver [Fallback](#fallback)), así que no se queda atascado.

Si sólo quieres probar la app sin gastar tokens, usa el **modo mock** (paso 3)
y no necesitas instalar ni autenticar ninguno de estos.

## Inicio rápido

### 1. Instalar dependencias

```bash
npm install        # backend
cd ui && npm install && cd ..   # interfaz gráfica
```

### 2. Arrancar la app

Abre **dos terminales** desde la raíz del repo:

```bash
# Terminal 1 — backend (API en http://127.0.0.1:4000)
npm run api

# Terminal 2 — interfaz (http://localhost:3000)
cd ui && npm run dev
```

Luego abre **http://localhost:3000** en el navegador.

### 3. (Opcional) Probar sin gastar tokens

Si no quieres usar modelos reales ni tocar Git, arranca el backend en modo mock:

```bash
MRROBOT_MOCK=1 npm run api   # Terminal 1
cd ui && npm run dev         # Terminal 2
```

### Configurar las claves (solo para uso real)

Crea un archivo `.env` en la raíz con tus claves:

```env
DEEPSEEK_API_KEY=tu_clave
GITHUB_TOKEN=tu_token      # opcional, para repos de GitHub
```

Sin `MRROBOT_MOCK=1` necesitas `DEEPSEEK_API_KEY` y los CLIs `codex`/`claude`
instalados y autenticados (ver [Requisitos previos](#requisitos-previos)) para
que todos los agentes funcionen. Consulta la sección
[Variables de entorno](#variables-de-entorno) para más opciones.

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
- `chats/`: hilos de conversación por proyecto; cada mensaje pasa por el planner
  y añade/ajusta tareas asociadas al chat.
- `storage/`: persistencia (PGlite) + event log.
- `graph/`: grafo LangGraph que orquesta planner/scheduler/supervisor.

## Comandos útiles

```bash
npm test              # tests del motor
npm run typecheck     # chequeo de tipos del backend
npm run mrrobot help  # ayuda del CLI
```

La UI habla con la API a través de `NEXT_PUBLIC_API_URL` (por defecto
`http://127.0.0.1:4000`).

El modo mock simula agentes, planner, reviewer, supervisor y worktrees de
forma determinista. Escenarios disponibles vía `MRROBOT_MOCK_SCENARIO`:
`success` (por defecto), `replan` y `fail`.

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

Un proyecto puede sobrescribir estos valores al crearse (pantalla *New Project*,
avanzado) o después mediante `PATCH /api/projects/:id/config` (mientras esté en
`draft`, `ready` o `paused`). Al primer cambio, el proyecto materializa su propia
config (deja de heredar del global). Si no define config, usa la global.

## Variables de entorno

```env
DEEPSEEK_API_KEY=...       # requerido por el provider DeepSeek
GITHUB_TOKEN=...           # opcional, para validar/push a repos GitHub (HTTPS)
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
`task_attempts`, `agent_runs`, `reviews`, `supervisor_runs`, `events`, `chats`,
`chat_messages`.

Para Postgres real basta añadir un `SqlExecutor` con `pg` y usar `SqlStorage`.

## Comandos CLI

```bash
npm run mrrobot -- create "Crear una librería TypeScript con sum(a,b), tests y README"
npm run mrrobot -- create "Calculadora web" --folder ~/proyectos/calc --remote https://github.com/acme/calc.git
npm run mrrobot -- plan <project-id>
npm run mrrobot -- run <project-id>
npm run mrrobot -- status <project-id>
npm run mrrobot -- tasks <project-id>
npm run mrrobot -- pause <project-id>
npm run mrrobot -- resume <project-id>
npm run mrrobot -- delete <project-id>
```

## Carpeta del proyecto y remoto

Cada proyecto puede tener su propia carpeta y un remoto de GitHub:

- **Carpeta**: se elige en la UI con el botón `Examinar…` (diálogo nativo de
  macOS vía `osascript`) o con `--folder` en el CLI. Si no existe, se crea y se
  inicializa con `git init` + commit inicial; si ya es un repo git, se
  reutiliza. Si se deja vacía, se usa el repositorio actual (`MRROBOT_REPO` o el
  cwd del backend).
- **Remoto**: la URL opcional se configura como `origin` del repo del proyecto.
  Si defines `GITHUB_TOKEN`, al crear el proyecto se valida el acceso con
  `git ls-remote`, y al completarse se hace push de la branch final
  (`agent/project-<id>-final`) al remoto. Sin token no se sube nada.

Los worktrees de cada proyecto se crean bajo `<carpeta>/.worktrees/`, que se
añade a `.git/info/exclude` del repo para no ensuciar el working tree.

Borrar un proyecto (`DELETE /api/projects/:id`, `mrrobot delete` o el botón
*Delete* de la UI) lo elimina de la app junto con sus tareas, eventos y reviews.
No borra su carpeta ni los worktrees del disco.

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

`classifyAvailability` detecta los límites de cuota (`usage_limit`,
`rate_limit`) y de autenticación (`auth`) y los trata como «no disponible»,
por lo que al agotar la cuota o el límite de un proveedor el motor salta al
siguiente modelo de la cadena sin intervención manual.

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

## Chats por proyecto

Un proyecto puede tener varios **chats** (hilos de conversación independientes).
Cada chat guarda su historial (`chats` + `chat_messages` en storage) y las
tareas que genera. Al enviar un mensaje:

1. Se persiste el mensaje del usuario y se emite `chat.message`.
2. El planner recibe el objetivo del proyecto, el plan actual del chat y la
   conversación, y devuelve un plan.
3. Los IDs del plan se prefijan por chat (`C1-TASK-001`, `C2-TASK-001`, …) para
   que no colisionen entre chats, y las tareas se asocian al chat (`task.chatId`).
4. Las tareas `done` del chat se conservan; el resto se reemplaza por el plan
   nuevo. Las tareas de otros chats no se tocan.
5. Se guarda el mensaje del asistente (resumen + IDs) y se emite `chat.message` y
   `plan.updated`.

Si el proyecto estaba `draft` o en estado terminal (`completed`/`failed`/
`cancelled`) y el chat añade tareas pendientes, el proyecto vuelve a `ready` para
poder lanzar una nueva ejecución. Borrar un chat elimina sus tareas y mensajes.

Los chats se exponen en la UI como pestaña **Chats** (disponible en todos los
estados salvo `running`); el backend es la fuente de verdad y el SSE refresca el
hilo en vivo.

## Git

- Cada intento: branch `agent/<task>-attempt-N` y worktree `.worktrees/...`.
- Dependencias: `integration/<task>` con `git cherry-pick` de los commits de las
  dependencias. Si hay conflicto, la tarea queda `blocked` con `integrationError`
  (`type: "git_conflict"`), sin tocar el repo principal.
- Resultado final: branch aislada `agent/project-<id>-final`. **Nunca** se hace
  merge a `main`/`master` ni operaciones destructivas sobre el repo principal.

## Event log

`project.created`, `plan.started`, `plan.generated`, `plan.updated`,
`project.config_updated`,
`task.started`, `task.completed`, `task.failed`, `task.review_passed`,
`task.review_failed`, `git.conflict`, `supervisor.replan`, `project.paused`,
`project.resumed`, `project.completed`, `project.cancelled`, `project.error`,
`project.deleted`, `chat.created`, `chat.message`, `chat.deleted`.

## API HTTP

Capa fina en `src/api` (Node `http`, sin dependencias extra). Endpoints:

```text
GET    /api/info                       info del backend, agentes, config
PUT    /api/config                     actualiza la config global
GET    /api/projects                   lista proyectos (resumen)
POST   /api/projects                   crea un proyecto (draft)
GET    /api/projects/:id               proyecto completo + stats
DELETE /api/projects/:id               borra el proyecto de la app (no toca el disco)
PATCH  /api/projects/:id/config        actualiza settings/modelos (draft|ready|paused)
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
GET    /api/projects/:id/chats         lista los chats del proyecto
POST   /api/projects/:id/chats         crea un chat (opcional `message`)
GET    /api/projects/:id/chats/:chatId detalle del chat + mensajes
DELETE /api/projects/:id/chats/:chatId borra el chat y sus tareas
POST   /api/projects/:id/chats/:chatId/messages envía un mensaje (planner → tareas)
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
