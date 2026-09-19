/**
 * Prefijos que delatan una ruta absoluta del filesystem en un criterio de
 * aceptación. Los criterios se evalúan en un worktree aislado, así que una ruta
 * absoluta a la copia principal (`/Users/...`) o al home (`~/...`) apunta a
 * archivos que no existen en el workspace.
 */
const ABSOLUTE_PATH_PATTERNS: RegExp[] = [
  /(?:^|[\s("'`])\/(?:Users|home|tmp|var|etc|opt|private|mnt|media|root|usr|Applications|Volumes)\//i,
  /(?:^|[\s("'`])[A-Za-z]:[\\/]/,
  /(?:^|[\s("'`])~\//,
];

/** Criterios que citan rutas absolutas del filesystem. */
export function findAbsolutePaths(criteria: string[]): string[] {
  return criteria.filter((criterion) =>
    ABSOLUTE_PATH_PATTERNS.some((pattern) => pattern.test(criterion)),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reancla a la raíz del repositorio los criterios que citan rutas absolutas
 * dentro de ella. Tanto el agente como el reviewer corren en un worktree, de
 * modo que `/repo/package.json` debe leerse como `package.json`.
 */
export function normalizeCriterion(
  criterion: string,
  repoRoot?: string,
): string {
  if (!repoRoot) {
    return criterion;
  }

  const root = repoRoot.replace(/[\\/]+$/, "");

  if (!root) {
    return criterion;
  }

  const pattern = new RegExp(
    `(^|[\\s("'\`])${escapeRegExp(root)}[\\\\/]`,
    "gi",
  );

  return criterion.replace(pattern, "$1");
}

/** Normaliza una lista de criterios contra la raíz del repositorio. */
export function normalizeCriteria(
  criteria: string[],
  repoRoot?: string,
): string[] {
  return criteria.map((criterion) => normalizeCriterion(criterion, repoRoot));
}
