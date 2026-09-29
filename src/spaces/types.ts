/**
 * Proyecto del usuario: agrupa objetivos bajo un nombre, un icono y la
 * carpeta donde se trabaja. No confundir con `Project`, que es cada
 * ejecución de un objetivo.
 */
export interface Space {
  id: string;
  name: string;
  /** Nombre de un icono de la UI (p. ej. "folder", "wrench"). */
  icon: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSpaceInput {
  name: string;
  icon: string;
  path: string;
}
