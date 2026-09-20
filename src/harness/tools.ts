/**
 * Definiciones de herramientas para el bucle de tool-calling.
 * Nombres en inglés snake_case, descripciones en español.
 */

import type { ToolDefinition } from "./types.js";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_files",
    description: "Lista archivos y directorios en una ruta",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Ruta a listar (por defecto la raíz del proyecto)",
        },
        depth: {
          type: "number",
          description: "Profundidad de listado (por defecto 1)",
        },
      },
    },
  },
  {
    name: "read_file",
    description: "Lee el contenido de un archivo",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta del archivo" },
        start_line: {
          type: "number",
          description: "Línea de inicio (0-based, por defecto 0)",
        },
        max_lines: {
          type: "number",
          description: "Máximo de líneas a leer (por defecto todas)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Crea o sobrescribe un archivo con contenido",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta del archivo" },
        content: { type: "string", description: "Contenido a escribir" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description:
      "Edita un archivo reemplazando un fragmento de texto. El fragmento de búsqueda debe ser único.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Ruta del archivo" },
        find: { type: "string", description: "Texto a buscar y reemplazar" },
        replace: { type: "string", description: "Texto de reemplazo" },
      },
      required: ["path", "find", "replace"],
    },
  },
  {
    name: "search_files",
    description: "Busca un patrón de texto en archivos del proyecto",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Patrón a buscar" },
        path: {
          type: "string",
          description: "Ruta donde buscar (por defecto la raíz)",
        },
        max_results: {
          type: "number",
          description: "Máximo de resultados (por defecto 100)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "run_command",
    description:
      "Ejecuta un comando en el proyecto (npm, git, node, etc). Solo comandos permitidos.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: 'Comando (ej: "npm", "git")' },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Argumentos del comando",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "finish",
    description:
      "Marca la tarea como completada. Obligatorio para terminar con éxito.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Resumen de lo que se implementó",
        },
        files_changed: {
          type: "array",
          items: { type: "string" },
          description: "Archivos que se crearon o modificaron",
        },
      },
      required: ["summary"],
    },
  },
];

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}
