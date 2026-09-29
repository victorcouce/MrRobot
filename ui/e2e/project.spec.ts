import { expect, test, type Page } from "@playwright/test";

async function createProject(page: Page, goal: string): Promise<void> {
  // El selector nativo de carpetas no se puede manejar en el navegador: se
  // simula la respuesta del backend con una ruta temporal.
  await page.route("**/api/fs/pick-folder", (route) =>
    route.fulfill({ json: { path: "/tmp/mrrobot-e2e" } }),
  );

  await page.goto("/");
  await page.getByPlaceholder(/Crea una calculadora web/).fill(goal);
  await page.getByRole("button", { name: /carpeta/i }).click();
  await page.getByRole("button", { name: "Planificar" }).click();

  // El proyecto se crea al enviar y el hilo acoge la entrevista de afinado.
  await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Generar el plan" }).click();

  await expect(
    page.getByRole("button", { name: "Ejecutar", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

test("flujo completo: crear → planificar → ejecutar → completado", async ({
  page,
}) => {
  await createProject(
    page,
    "Crear una librería TypeScript con una función sum, tests y README.",
  );

  // El modal planifica al crear, así que el proyecto llega listo para ejecutar.
  await expect(
    page.getByRole("button", { name: "Ejecutar", exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });

  // El plan aparece como un bloque dentro del hilo.
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();

  await page.getByRole("button", { name: "Grafo" }).click();
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();
  await page.getByRole("button", { name: "Lista" }).click();

  await page.getByRole("button", { name: "Ejecutar" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ejecutar" })
    .click();

  // Al terminar, el resultado ofrece el comando de merge.
  await expect(
    page.getByText("Completado", { exact: true }).first(),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^git merge agent\/project-/)).toBeVisible();
});

test("el hilo conserva la conversación tras recargar", async ({ page }) => {
  await createProject(page, "Librería TypeScript simple");

  await expect(
    page.getByRole("button", { name: "Ejecutar", exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Ejecutar" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ejecutar" })
    .click();

  await page.reload();
  await expect(
    page.getByText("Completado", { exact: true }).first(),
  ).toBeVisible({
    timeout: 30_000,
  });
});

test("un mensaje en el chat añade tareas al plan sin perder el hilo", async ({
  page,
}) => {
  await createProject(page, "Librería TypeScript con una función sum");

  await expect(
    page.getByRole("button", { name: "Ejecutar", exact: true }),
  ).toBeVisible({
    timeout: 30_000,
  });

  const message = "Añade también un workflow de CI";
  await page.getByPlaceholder("Escribe un mensaje…").fill(message);
  await page.getByRole("button", { name: "Enviar" }).click();

  // El hilo conserva el turno del usuario y la respuesta del planner, y el
  // bloque del plan sigue debajo con el estado actual.
  await expect(page.getByText(message)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText("Librería TypeScript con función sum, tests y README."),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Plan", { exact: true })).toBeVisible();
});
