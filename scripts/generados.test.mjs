import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { archivosGenerados, RAIZ } from "./generar.mjs";

test("los archivos generados que están versionados coinciden con el generador (npm run generar)", () => {
    for (const [ruta, esperado] of Object.entries(archivosGenerados())) {
        const real = readFileSync(join(RAIZ, ruta), "utf8").replace(/\r\n/g, "\n");
        assert.equal(real, esperado, `${ruta} está desactualizado: corre npm run generar`);
    }
});
