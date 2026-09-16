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

  await page.getByRole("button", { name: "Generate plan" }).click();

  // Espera a que el plan esté listo (botón Start project visible).
  await expect(
    page.getByRole("button", { name: "Start project" }),
  ).toBeVisible({ timeout: 30_000 });

  // Revisar el plan: lista y DAG.
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();
  await page.getByRole("tab", { name: "Graph" }).click();
  await expect(page.getByText("Implementar sum(a, b)")).toBeVisible();

  // Iniciar la ejecución con confirmación.
  await page.getByRole("tab", { name: "List" }).click();
  await page.getByRole("button", { name: "Start project" }).click();
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
  await page.getByRole("button", { name: "Generate plan" }).click();

  await expect(
    page.getByRole("button", { name: "Start project" }),
  ).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Start project" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start project" })
    .click();

  // Refrescar a mitad de la ejecución (el mock es instantáneo, por lo que
  // puede que ya haya terminado; en cualquier caso el estado debe recuperarse).
  await page.reload();
  await expect(page.getByText("Final branch")).toBeVisible({ timeout: 30_000 });
});
