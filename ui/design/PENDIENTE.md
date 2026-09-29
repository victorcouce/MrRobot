# Prompt: cerrar el pulido pendiente del rediseño chat-first

Trabajas en **MrRobot** (`victorcouce/MrRobot`), un orquestador multiagente:
backend TypeScript en `src/`, UI Next.js App Router + Tailwind en `ui/`, tipos
compartidos en `shared/types.ts`.

Desarrolla y commitea en la rama `claude/optimistic-goldberg-re8svw`.

## Contexto

`ui/design/HANDOFF.md` es la especificación del rediseño chat-first, con las
pantallas en `ui/design/screens/*.html` y `ui/design/png/*.png` como fuente de
verdad visual. Las fases 1 a 6 ya están implementadas. Lo que queda es pulido:
seis puntos sueltos, independientes entre sí, que se pueden hacer en una tacada.

Convenciones que ya sigue el código y que debes respetar:

- **Todo el copy de la UI va en español.** Quedan restos en inglés y son parte
  del trabajo.
- **Se usan los design tokens de `ui/tailwind.config.ts`** (`primary`, `ink-*`,
  `line-*`, `surface`, `rounded-block`, `shadow-block`…), no clases `zinc-*` ni
  colores sueltos. El token `accent` se eliminó a propósito: no lo reintroduzcas.
- **La UI no afirma nada que no haya comprobado.** Varios commits recientes se
  dedicaron justamente a quitar textos fijos que fingían ser datos reales. Si un
  dato viene del backend, pídelo; no lo repliques en el cliente.
- Los bloques del hilo usan `Block`/`BlockHeader`/`BlockContent` de
  `ui/src/components/ui/Block.tsx`.

## Tareas

### 1. La matriz tipo×complejidad de Agentes está duplicada

`ui/src/app/agents/page.tsx` pinta la tabla "Asignación: Tipo × Complejidad" con
un array escrito a mano. Esas reglas viven en `selectAgent` de
`src/agents/selector.ts`. Hoy coinciden, pero cualquier cambio en el motor
dejará la tabla mintiendo sin que nada falle.

Deriva la tabla de la fuente real. La vía limpia es exponerla desde el backend
(por ejemplo `GET /api/agents/matrix`, recorriendo los seis `TaskType` por las
cuatro `TaskComplexity` y llamando a `selectAgent`) y que la página la consuma.
Añade un test que compare la matriz servida con `selectAgent` para que no pueda
volver a desincronizarse.

### 2. Actividad no tiene filtro por proyecto

`ui/src/app/activity/page.tsx` tiene filtros por categoría y buscador, pero el
handoff (pantalla 5-3) pide también filtro por proyecto. La página ya carga
`useProjects()` y construye un `projectMap`, así que falta el control. Añádelo
junto a los chips de categoría.

De paso, ese fichero tipa los filtros como `(event: any)`. Usa `ProjectEvent`.

### 3. La barra lateral colapsada está incompleta

En `ui/src/components/layout/AppShell.tsx`, el modo colapsado (64px) debe
mostrar, según §3 del handoff: logo · expandir · Nuevo proyecto · **buscar** ·
proyectos como cuadrados con iniciales y punto de estado · y abajo **Agentes**
(con punto verde si hay conexión), **Actividad** y Ajustes. Hoy solo hay logo,
expandir, Nuevo proyecto, proyectos y Ajustes.

Además, en ese mismo fichero:

- El **proyecto activo debe llevar borde `ink`** (hoy no hay estado activo;
  compara con `usePathname()`).
- El punto de estado del proyecto usa `absolute bottom-0 right-0` sobre un
  `Link` que **no tiene `relative`**, así que se posiciona respecto a un
  ancestro que no le corresponde. Añade `relative` al enlace.
- El color del punto solo distingue `running` de todo lo demás. Usa
  `PROJECT_STATUS` de `ui/src/lib/status.ts`, que ya tiene el color por estado.
- La lista está recortada a `projects.slice(0, 5)` sin que nada lo indique.
  Muestra todos con scroll, o di en la UI que son los recientes.
- El botón "Nuevo proyecto" del modo extendido combina `w-full` con `mx-3`, lo
  que lo desborda 24px. Y el handoff pide que muestre el atajo `⌘N`, que ya está
  implementado en `LayoutContent`.

### 4. El editor de tareas no muestra la cadena de fallback

`ui/src/components/projects/TaskEditor.tsx` deja elegir agente pero no enseña la
cadena de fallback, que la pantalla 4-3 sí muestra. La cadena la calcula
`getFallbackChain(task, allowed)` en `src/agents/fallback.ts`; ten en cuenta que
desde la Fase 6 se filtra por los agentes permitidos del chat.

Decide si la calculas en el backend (coherente con el punto 1: una sola fuente
de verdad) o la replicas en el cliente. Si la replicas, deja claro en el código
que es una copia y añade un test que la contraste con la del motor.

Ese fichero tiene además las etiquetas en inglés: `Title`, `Description`,
`Type`, `Complexity`, `Agent`, `Acceptance criteria`, `Dependencies`, `Cancel`.
Tradúcelas.

### 5. La paleta ⌘K no busca tareas

`ui/src/components/CommandPalette.tsx` busca proyectos, chats y acciones. El
handoff §6.6 pide también tareas de todos los proyectos.

No hay endpoint de búsqueda y traerse todos los proyectos al cliente para
filtrar no escala. Añade uno (por ejemplo `GET /api/search?q=`) que devuelva
chats y tareas con su proyecto, y consúmelo con debounce.

Otros detalles del mismo fichero: el array `commands` y `filtered` se recrean en
cada render y el efecto de teclado depende de `filtered`, así que se resuscribe
continuamente; el contenedor no declara `role="dialog"` ni `aria-modal`.

### 6. Restos sueltos

- **Fuentes**: `ui/src/app/globals.css` las carga con `@import` de Google Fonts.
  El handoff §2 pide `next/font/google` exponiendo `--font-sans`, `--font-mono`
  y `--font-display`. Cámbialo en `ui/src/app/layout.tsx`.
- **`ui/src/components/projects/ImportProjectDialog.tsx`**: `label="Name"` en
  español.
- **Validación de adjuntos** (`src/api/parse.ts`, `parseAttachments`): los
  límites de 2MB por adjunto y 5MB en total se comprueban contra el campo `size`
  que manda el cliente, no contra la longitud real de `data`. Un cliente puede
  declarar `size: 0` y subir lo que quiera. Contrasta `size` con el tamaño real
  del base64 y rechaza si no cuadran.

## Puertas de calidad

Todo esto tiene que quedar en verde antes de commitear:

```bash
npm run typecheck          # backend
npm test                   # backend
cd ui && npm run typecheck
cd ui && npm test
cd ui && npm run build
cd ui && npm run e2e       # requiere: npx playwright install
```

Notas:

- `src/workspace/manager.test.ts` tiene **un test que ya fallaba antes**
  (`prepareProjectRepo reutiliza un repo existente`): hace `git ls-remote`
  contra github.com y necesita un `GITHUB_TOKEN` válido. El resto debe pasar
  (144 de 145 en el último commit). No lo arregles ni lo saltes: solo no lo
  confundas con una regresión tuya.
- Añade tests para lo que cambies. Los recientes están en
  `ui/src/app/settings/page.test.tsx`, `ui/src/components/NewProjectModal.test.tsx`
  y `ui/src/components/projects/ChatThread.test.tsx`, y sirven de referencia de
  estilo.
- Si la UI cambia de forma que afecte al flujo, actualiza `ui/e2e/project.spec.ts`
  y **ejecútalo**, no lo des por bueno.

## Cómo entregarlo

Commits en español, explicando el porqué y no solo el qué, y push a
`claude/optimistic-goldberg-re8svw`. Puedes agrupar los seis puntos en un commit
de pulido o separarlos; lo que no vale es dejar a medias uno de ellos.

Si al abrir el código ves que alguno de estos puntos ya no aplica o está mal
descrito, dilo en vez de forzarlo: este documento se escribió desde una revisión
y puede haber envejecido.
