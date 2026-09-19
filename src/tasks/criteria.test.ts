import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findAbsolutePaths,
  normalizeCriteria,
  normalizeCriterion,
} from "./criteria.js";

test("findAbsolutePaths detecta rutas POSIX, Windows y home", () => {
  assert.deepEqual(
    findAbsolutePaths([
      "existe /Users/victor/Developer/calc/package.json",
      "compila",
      "C:\\proyectos\\calc\\index.ts se genera",
      "~/calc/README.md documenta la API",
    ]),
    [
      "existe /Users/victor/Developer/calc/package.json",
      "C:\\proyectos\\calc\\index.ts se genera",
      "~/calc/README.md documenta la API",
    ],
  );
});

test("findAbsolutePaths no marca rutas de API relativas", () => {
  assert.deepEqual(
    findAbsolutePaths(["/api/users responde 200", "npm test pasa"]),
    [],
  );
});

test("normalizeCriterion reancla la raíz del repo a relativo", () => {
  assert.equal(
    normalizeCriterion("existe /repo/package.json", "/repo"),
    "existe package.json",
  );
  assert.equal(normalizeCriterion("npm test pasa", "/repo"), "npm test pasa");
  assert.equal(
    normalizeCriterion("existe /otro/package.json", "/repo"),
    "existe /otro/package.json",
  );
  assert.equal(normalizeCriterion("/repo/foo.ts", undefined), "/repo/foo.ts");
});

test("normalizeCriteria normaliza toda la lista", () => {
  assert.deepEqual(
    normalizeCriteria(["lee /repo/a.ts", "compila"], "/repo/"),
    ["lee a.ts", "compila"],
  );
});
