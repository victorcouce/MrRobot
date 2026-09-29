# Prompts para Claude Code

Lanza una fase por sesión, en orden. Revisa el resultado antes de pasar a la siguiente.

## Fase 1 · Base

```
Lee ui/design/HANDOFF.md completo y abre los archivos de ui/design/screens/ del grupo 1 (1-*.html).
Implementa la Fase 1 del plan (sección 8):
- Añade los design tokens (sección 2) a ui/tailwind.config.ts y ui/src/app/globals.css, y carga Geist, Geist Mono e Instrument Serif con next/font.
- Rehaz components/layout/AppShell.tsx con la barra lateral colapsada por defecto y la extendida (1-3), guardando la preferencia.
- Rehaz la página de inicio (1-1) y crea app/projects/page.tsx con la lista (1-4).
- Añade la paleta ⌘K (1-5) y el banner de modo mock (1-2).
No copies el HTML: reimplementa con React + Tailwind reutilizando components/ui. No toques el backend.
Actualiza los tests afectados y deja typecheck y test en verde. Al terminar, resume qué cambió y qué queda pendiente.
```

## Fase 2 · Crear proyecto

```
Sigue con la Fase 2 de ui/design/HANDOFF.md usando ui/design/screens/2-*.html.
Sustituye /projects/new y CreateProjectForm por el modal "Nuevo proyecto" (2-1), con estados de error (2-2) y de progreso (2-3).
Usa los endpoints existentes (POST /api/projects y POST /api/projects/:id/plan). Si falta algo para validar carpeta o remoto en vivo, no lo inventes: déjalo marcado con TODO y lístalo al final.
El modal se abre desde el botón de la barra lateral, ⌘N y el inicio. Tests y typecheck en verde.
```

## Fase 3 · Hilo del chat

```
Fase 3 de ui/design/HANDOFF.md con ui/design/screens/3-*.html (datos de ejemplo de listas en la sección 5).
Rehaz components/projects/ProjectWorkspace.tsx como un hilo de chat (sección 1 y 3): los bloques Plan (Lista/Grafo/Tablero), Planificando, Kanban en vivo, eventos, Review fallido, Supervisor, Resultado, Preview y Proyecto fallido se renderizan dentro del hilo en orden cronológico a partir de mensajes + eventos + estado del proyecto (useProject/SSE).
Reutiliza la lógica de PlanView, DagView, ExecutionView, ResultView y PreviewPanel, pero con el nuevo aspecto. Elimina las pestañas.
Respeta los comportamientos de la sección 7. Actualiza tests y el E2E si cambia el flujo.
```

## Fase 4 · Componentes y modales

```
Fase 4 de ui/design/HANDOFF.md con ui/design/screens/4-1, 4-3, 4-4 y 4-5.
Rehaz TaskDetail como bloque expandible, TaskEditor e ImportProjectDialog como en el diseño, y añade los diálogos de confirmación (ejecutar, cancelar, borrar proyecto con nombre, borrar chat). Tests y typecheck en verde.
```

## Fase 5 · Pantallas de sistema

```
Fase 5 de ui/design/HANDOFF.md con ui/design/screens/5-*.html.
Rehaz app/settings (5-1, config global con PUT /api/config), app/agents (5-2) y app/activity (5-3).
Retira ProjectSettingsDialog de la UI. Tests y typecheck en verde.
```

## Fase 6 · Agentes por chat y adjuntos (backend + UI)

```
Lee la sección 6 de ui/design/HANDOFF.md y ui/design/screens/4-2-Attach.html.
Antes de escribir código, propón un plan: cambios en shared/types.ts, storage (migraciones), chats/service.ts, planner, agents (filtrar la cadena de fallback por los agentes permitidos del chat), runner (inyectar adjuntos en el prompt) y los endpoints nuevos. Espera mi confirmación.
Después implementa backend con tests y la UI: popover de agentes en el composer, adjuntos en mensajes, vista previa de .md y bandeja de subida.
```
