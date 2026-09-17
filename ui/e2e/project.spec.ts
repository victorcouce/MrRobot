import { expect, test } from "@playwright/test";

test("flujo completo: crear → planificar → ejecutar → completado", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("link", { name: "New Project" }).first().click();

  await page.getByLabel("Name").fill("Librería sum");
  await page
    .getByLabel("Goal")
    .fill("Crear una librería TypeScript con una función sum, tests y README.");

  await page.getByRole("button", { name: "Create project" }).click();

  // Espera a que se cree el proyecto y se redirija a la página
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);

  // Generar el plan desde el ThreadHeader
  await page.getByRole("button", { name: "Plan" }).click();

  // Espera a que el plan esté listo (botón Run visible).
  await expect(
    page.getByRole("button", { name: "Run" }),
  ).toBeVisible({ timeout: 30_000 });

  // Revisar el plan: verificar que se muestra en el hilo
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();

  // Cambiar a vista Grafo
  await page.getByRole("button", { name: "Grafo" }).click();
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();

  // Volver a vista Lista
  await page.getByRole("button", { name: "Lista" }).click();

  // Iniciar la ejecución con confirmación.
  await page.getByRole("button", { name: "Run" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start project" })
    .click();

  // El proyecto termina y se muestra la branch final.
  await expect(page.getByText("Final branch")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
});

test("refresh durante ejecución reconstruye el estado", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "New Project" }).first().click();
  await page.getByLabel("Goal").fill("Librería TypeScript simple");
  await page.getByRole("button", { name: "Create project" }).click();

  // Espera a que se cree el proyecto y se redirija a la página
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);

  // Generar el plan
  await page.getByRole("button", { name: "Plan" }).click();

  await expect(
    page.getByRole("button", { name: "Run" }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Run" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start project" })
    .click();

  // Refrescar a mitad de la ejecución (el mock es instantáneo, por lo que
  // puede que ya haya terminado; en cualquier caso el estado debe recuperarse).
  await page.reload();
  await expect(page.getByText("Final branch")).toBeVisible({ timeout: 30_000 });
});
