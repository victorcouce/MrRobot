# MrRobot · Rediseño chat-first — handoff para implementación

Este documento y la carpeta `screens/` describen el rediseño completo de la UI (`ui/`, Next.js App Router + Tailwind). Léelo entero antes de tocar código.

## 0. Cómo usar este paquete

- `screens/*.html` son la **fuente de verdad visual**: colores, tamaños, radios, espaciados y textos exactos están en los estilos inline y en el `<style>` de cada archivo. Ábrelos en el navegador para verlos.
- **No copies el HTML tal cual.** Reimplementa con componentes React + Tailwind del proyecto, reutilizando lo que ya existe en `ui/src/components`.
- `png/` tiene una captura de cada pantalla, con el mismo nombre que su HTML (`1-1-Main.png` ↔ `1-1-Main.html`). Úsalas como referencia visual rápida; ante cualquier diferencia entre imagen y código, **manda el HTML**.
- Los archivos vienen de un editor de diseño: ignora `<x-dc>`, `<helmet>`, `<script src="./support.js">` y el bloque `<script data-dc-script>`. Los `<sc-for>` / `{{…}}` de `3-2-Plan.html` y `3-3-Run.html` no se rellenan fuera del editor; sus datos de ejemplo están en la sección 5.
- Los nombres de proyecto, tareas, commits, rutas y eventos son **datos de ejemplo**. En la app salen de la API (`ui/src/lib/api.ts`, tipos en `shared/types.ts`).
- Todo el copy de la UI está en **español**.
- Canvas original (referencia): https://claude.ai/artifact/Nm2DqQ1on1mt3pWP4bqDHg

## 1. Principio del rediseño

**El chat es la app.** Desaparecen las pestañas del workspace de proyecto (Lista/Grafo/Tablero/Actividad/Chats/Resultado). Todo lo que ocurre en un proyecto aparece como un **bloque dentro del hilo del chat**, en orden cronológico:

| Antes (componente actual) | Ahora (bloque en el hilo) |
|---|---|
| `PlanningState` | Bloque "Planificando" con pasos y spinner (3.1) |
| `PlanView` + `DagView` + `TaskTable` | Bloque "Plan" con conmutador Lista · Grafo · Tablero (3.1, 3.2) |
| `ExecutionView` + `AgentsPanel` | Bloque "Tablero" kanban en vivo (3.3) |
| `SupervisorBanner` | Bloque de decisión del supervisor (3.4, 3.5) |
| `ResultView` | Bloque "Resultado" (3.4) y "No pudo terminar" (3.5) |
| `PreviewPanel` | Bloque "Preview" con iframe/placeholder y log (3.4) |
| `TaskDetail` (drawer) | Bloque "Detalle de tarea" expandible (4.1) |
| `ActivityLog` (pestaña) | Filas de evento compactas intercaladas en el hilo (3.3) + página global (5.3) |
| `ChatsPanel` | El propio hilo + lista de chats en la barra lateral |
| `ProjectSettingsDialog` | **Eliminado** — los ajustes son globales (5.1) |
| `CreateProjectForm` / `/projects/new` | Modal "Nuevo proyecto" (2.1–2.3) + atajo en inicio (1.1) |

El bloque del plan/tablero **siempre muestra el estado actual** (no una foto del momento en que se envió el mensaje).

## 2. Design tokens

Añádelos a `tailwind.config.ts` (`theme.extend`) y `globals.css`. Solo **light mode** en esta fase (el `ThemeToggle` puede quedar oculto).

### Colores

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#FAFAF8` | Fondo de la app |
| `surface` | `#FFFFFF` | Bloques, tarjetas, modales, composer |
| `sidebar` | `#F5F4F0` | Barra lateral |
| `subtle` | `#FCFCFA` | Pie de bloques (`bfoot`), cabeceras de tabla |
| `muted` | `#F2F1ED` | Chips, segmented control |
| `user-bubble` | `#EFEEEA` | Burbuja de mensaje del usuario |
| `line` | `#ECEBE6` | Bordes de bloques y separadores |
| `line-soft` | `#F3F2EE` | Separadores entre filas |
| `line-strong` | `#DCDAD3` | Bordes de inputs y botones secundarios |
| `ink` | `#16161A` | Texto principal, logo |
| `ink-2` | `#44444B` | Texto secundario fuerte |
| `ink-3` | `#55555C` | Texto secundario |
| `ink-4` | `#6E6E76` | Captions, metadatos (mínimo permitido para texto) |
| `primary` | `#3346E0` | **Botones de acción primaria**, enlaces, estado "en curso" |
| `primary-hover` | `#2233B8` | Hover de enlaces/primario |
| `primary-soft` | `#EEF0FD` | Fondo de pill "Listo/Ejecutando", selección |
| `primary-soft-text` | `#2F3FC8` | Texto sobre `primary-soft` |
| `success` / `success-soft` / `success-text` | `#1E7A4C` / `#E8F4EC` / `#1E6B43` | Hecha, completado, conectado |
| `warning` / `warning-soft` / `warning-text` | `#C98A1B` · `#9A5B00` / `#FBF1DE` / `#8A5200` | Bloqueada, fallback, sin clave |
| `danger` / `danger-soft` / `danger-text` | `#B42318` / `#FCEBEA` / `#A11F15` | Fallida, errores, acciones destructivas |
| `neutral-dot` | `#B7B5AD` · `#D6D4CC` | Borrador, agente no disponible |

Reglas: el **primario es cobalto, nunca negro**. El negro (`ink`) solo en logo, texto y selección del proyecto activo en la barra colapsada. Verde/ámbar/rojo solo para estados.

### Tipografía

| Rol | Fuente | Tamaños |
|---|---|---|
| UI / cuerpo | **Geist** 400/500/600 | 13–15 px (cuerpo de chat 15px, line-height 1.6) |
| IDs, ramas, agentes, rutas, commits | **Geist Mono** 400/500 | 11–13 px |
| Titulares grandes (inicio, títulos de página, resultado) | **Instrument Serif** 400 | 30–56 px, letter-spacing −0.01em |

Cárgalas con `next/font/google` y exponlas en `--font-sans`, `--font-mono`, `--font-display`.

### Forma y elevación

- Radios: botones/inputs 10px · chips 6–8px · bloques 16px · composer 18px · modales 18px · pills 999px.
- Sombra de bloque: `0 1px 2px rgba(22,22,26,.04), 0 12px 32px -18px rgba(22,22,26,.14)`.
- Sombra de modal: `0 4px 12px rgba(22,22,26,.08), 0 32px 80px -24px rgba(22,22,26,.4)`; overlay `rgba(22,22,26,.30)`.
- Alturas: botón 34–36px, input 38px, fila de tabla 46–64px, cabecera de página 56px.
- Iconos: SVG de trazo 1.8px, 14–18px (equivalente a lucide-react; puedes añadir esa dependencia).
- Animaciones: `pulse` 1.6s para puntos "en vivo"; barra `shimmer` 2px para trabajo en curso; `spin` para pasos activos.

## 3. Layout base

- **Barra lateral colapsada por defecto** (64px, `sidebar`): logo · expandir · Nuevo proyecto (botón primario cuadrado) · buscar · proyectos como cuadrados con iniciales y punto de estado · abajo Agentes (punto verde si hay conexión), Actividad, Ajustes. Proyecto activo = borde `ink`.
- **Barra extendida** (272px, 1.3): logo + botón colapsar · "Nuevo proyecto ⌘N" · buscador ⌘K · proyectos con sus chats anidados y `+` por proyecto (deshabilitado si el proyecto está `running`) · pie con Agentes/Actividad/Ajustes. Guardar la preferencia en `localStorage`.
- **Cabecera de chat** (56px): `proyecto / chat` · pill de estado · metadatos · a la derecha Actividad y la acción contextual (Ejecutar / Pausar / Cancelar).
- **Hilo**: columna centrada de 820px; los bloques anchos (grafo, kanban) se expanden a 1060px. Composer fijo abajo, 820px.
- **Composer**: textarea + chips `Adjuntar` y `Agentes` (selector, ver 4.2) + botón enviar primario. Durante `running` se sustituye por un aviso "El chat se reabre cuando la ejecución termine o la pauses" + botón "Pausar y escribir". Durante `planning`, aviso con spinner.

## 4. Índice de pantallas

| Archivo | Pantalla | Implementa / sustituye |
|---|---|---|
| `1-1-Main.html` | Inicio: "¿Qué construimos hoy?" con composer rápido (carpeta, remoto, agentes) y Recientes | `app/page.tsx` |
| `1-2-EmptyChat.html` | Chat nuevo vacío en un proyecto + **banner de modo mock** (`MRROBOT_MOCK=1`) | `app/projects/[id]` con `?chat=` nuevo |
| `1-3-PlanSidebar.html` | Barra lateral extendida (sobre la vista de plan) | `components/layout/AppShell.tsx` |
| `1-4-Projects.html` | Lista de proyectos: filtros por estado, buscador, tabla, menú de fila | nueva `app/projects/page.tsx` (el dashboard actual se mueve aquí) |
| `1-5-Search.html` | Paleta ⌘K: chats, tareas y acciones | nuevo `CommandPalette` global |
| `2-1-NewModal.html` | **Modal Nuevo proyecto** (un solo paso): objetivo + adjuntos, nombre, carpeta (con detección git), agentes, "Más opciones" plegado | sustituye `/projects/new` y `CreateProjectForm` |
| `2-2-NewModalError.html` | Validación: objetivo vacío, carpeta inaccesible, "Más opciones" abierto (remoto GitHub con aviso de `GITHUB_TOKEN`, "Generar el plan al crear") | idem |
| `2-3-NewModalCreating.html` | Progreso dentro del modal: preparar repo → crear proyecto → generar plan → abrir chat; "Ir al chat ahora" | idem |
| `3-1-Planning.html` | Plan en vista **Grafo** (niveles, nodo seleccionado) + bloque "Planificando" con pasos; composer bloqueado | `PlanningState`, `DagView` |
| `3-2-Plan.html` | Plan en vista **Lista** dentro del hilo; iteración por chat con diff "+1 tarea"; fila nueva resaltada | `PlanView`, `TaskTable`, `ChatsPanel` |
| `3-3-Run.html` | Ejecución: filas de evento, bloque "Review no aprobado", **kanban en vivo** (En curso/Listas/Bloqueadas/Fallidas/Hechas) | `ExecutionView`, `AgentsPanel` |
| `3-4-Result.html` | Supervisor replanificó, **Resultado** (stats, rama, commit, push, agentes, comando de merge), **Preview**, y nuevo mensaje que reactiva el proyecto | `ResultView`, `PreviewPanel`, `SupervisorBanner` |
| `3-5-Failed.html` | Tarea fallida tras 3 agentes, supervisor decide `fail`, resultado fallido, composer para reconducir | idem |
| `4-1-Blocks.html` | Catálogo: detalle de tarea (intentos), conflicto git, error del planner, en pausa, estado de agentes | `TaskDetail`, etc. |
| `4-2-Attach.html` | **Adjuntos** (imágenes y .md) en mensaje, vista previa de .md, tareas con adjuntos, bandeja de subida y **popover de selector de agentes** | nuevo |
| `4-3-TaskEditor.html` | Modal editar tarea: título, descripción, tipo, complejidad, agente + cadena de fallback, dependencias, criterios | `TaskEditor` |
| `4-4-Import.html` | Modal importar: carpeta, lista de ramas `agent/project-*-final`, nombre/objetivo opcionales | `ImportProjectDialog` |
| `4-5-Dialogs.html` | Confirmaciones: ejecutar, cancelar ejecución, borrar proyecto (escribir nombre), borrar chat | usa `components/ui/Dialog` |
| `5-1-Settings.html` | **Ajustes globales**: Ejecución (concurrencia, reintentos, ciclos de review, intentos del planner), Modelos por rol, Agentes (estado, marcados por defecto, `DEEPSEEK_API_KEY`), Checks, GitHub, Apariencia | `app/settings/page.tsx` |
| `5-2-Agents.html` | Tarjetas por proveedor, "Trabajando ahora", matriz tipo×complejidad | `app/agents/page.tsx` |
| `5-3-Activity.html` | Actividad global con filtros por categoría/proyecto y búsqueda | `app/activity/page.tsx` |

## 5. Datos de ejemplo de pantallas con listas

**3-2 Plan (vista Lista)** — columnas: ID · Tarea · Tipo + barras de complejidad (1–4) · Agente · Depende de

| ID | Tarea | Tipo · cx | Agente | Deps |
|---|---|---|---|---|
| C1-TASK-001 | Scaffold Vite + TypeScript | coding · low | deepseek-flash | — |
| C1-TASK-002 | Layout responsive | coding · medium | claude / sonnet | 001 |
| C1-TASK-003 | Motor de cálculo y parser | coding · high | codex | 001 |
| C1-TASK-004 | Historial persistente | coding · medium | claude / sonnet | 003 |
| C1-TASK-005 | Tests unitarios y E2E | testing · medium | claude / sonnet | 003 · 004 |
| C1-TASK-006 *(nueva, resaltada `#F4F6FE` + pill "nueva")* | Modo oscuro | coding · low | deepseek-flash | 002 |

**3-3 Kanban** — 5 columnas con punto de color y contador; tarjeta = ID mono, título, nota opcional, chip de agente + tiempo. Tarjetas en curso con borde `#C9D0FA` y halo `#F0F2FE`. Columnas vacías = caja discontinua ("Nada en cola", "Sin fallos").

- En curso (punto `primary` animado): 003 Motor de cálculo — claude / sonnet — 03:12 — nota ámbar "Fallback desde codex · intento 1/2"; 006 Modo oscuro — deepseek-flash — 00:48
- Listas (`#7C8BEF`): vacía
- Bloqueadas (`#C98A1B`): 004 "Esperando a 003"; 005 "Esperando a 003, 004"
- Fallidas (`danger`): vacía
- Hechas (`success`): 001 — 02:18; 002 — 05:40 — nota verde "Aprobada en el ciclo 2"
- Cabecera: barra de progreso (hechas verde + en curso primario 35%) · "2 de 6 hechas · 2 agentes trabajando"

## 6. Cambios funcionales (requieren backend)

Estos puntos **no existen hoy** en la API; planifícalos antes de la UI correspondiente y propón el diseño de endpoints:

1. **Agentes por chat**: cada chat guarda la lista de agentes permitidos (`codex`, `claude/sonnet`, `claude/opus`, `deepseek-flash`, `deepseek-v4-pro`). `selectAgent`/`getFallbackChain` deben filtrar la cadena a esos agentes. Los no disponibles (p. ej. DeepSeek sin clave) aparecen deshabilitados. Valores por defecto en Ajustes.
2. **Adjuntos en mensajes y al crear proyecto**: imágenes (PNG/JPG/WebP) y `.md`. Se guardan con el mensaje, se pasan al contexto del planner y cada tarea puede referenciar los adjuntos que necesita (se inyectan en el prompt del worker).
3. **Configuración solo global**: se retira la edición de config por proyecto de la UI (`PATCH /api/projects/:id/config` puede quedar sin uso). Un proyecto en ejecución mantiene la config con la que empezó.
4. **"Generar el plan al crear"** opcional en el modal (si no, el proyecto queda en `draft`).
5. **Validación en vivo de carpeta y remoto** en el modal: detectar repo git + rama base y verificar el remoto (`git ls-remote`) antes de crear. Puede necesitar un endpoint de validación.
6. **Búsqueda ⌘K**: buscar en chats y tareas de todos los proyectos.

## 7. Comportamientos a respetar

- Chats deshabilitados mientras el proyecto está `running` (el `+` de la barra y el composer).
- Enviar un mensaje en un proyecto `completed/failed/cancelled/draft` que añade tareas lo devuelve a `ready` (mostrar "Listo · N pendientes").
- Errores del planner se muestran como bloque en el hilo con "Reintentar" (4.1).
- "Pausar" es cooperativo: el aviso dice "Pausar tras este lote".
- Cancelar avisa de que DeepSeek termina su lote.
- Borrar proyecto no toca disco (decirlo en el diálogo).
- MrRobot nunca hace merge: el resultado muestra el comando `git merge agent/project-<id>-final` para copiar.
- Accesibilidad: botones reales, `aria-label` en botones de solo icono, `aria-live` en bloques de progreso, contraste mínimo 4.5:1 (no usar gris más claro que `#6E6E76` para texto).

## 8. Plan de implementación por fases

Haz una fase por sesión, con tests (Vitest) actualizados y `npm run typecheck` + `npm test` en verde al final de cada una. Mantén el E2E (`e2e/project.spec.ts`) funcionando o actualízalo al nuevo flujo.

1. **Base** — tokens y fuentes; `AppShell` con barra colapsada/extendida; inicio (1.1); lista de proyectos (1.4); paleta ⌘K (1.5, solo UI si no hay endpoint); banner mock (1.2).
2. **Crear proyecto** — modal 2.1–2.3 (con validaciones del backend disponibles hoy); eliminar `/projects/new` redirigiendo al modal.
3. **Hilo del chat** — nuevo `ProjectWorkspace` basado en hilo: mensajes, composer, bloques Plan (Lista/Grafo/Tablero), Planificando, Kanban, eventos, Resultado, Preview, Fallido (3.1–3.5).
4. **Componentes y modales** — detalle de tarea, conflicto, error de planner, pausa (4.1); editor de tarea (4.3); importar (4.4); confirmaciones (4.5).
5. **Sistema** — Ajustes (5.1), Agentes (5.2), Actividad (5.3).
6. **Backend nuevo + UI asociada** — agentes por chat y adjuntos (4.2) según la sección 6.
