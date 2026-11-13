// Genera los archivos derivados: prometheus.yml (Railway y local) y los dashboards de Grafana.
// Uso: npm run generar   (la prueba comprueba que lo versionado coincide con lo generado)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { construirDashboards } from "./dashboards.mjs";
import { prometheusLocal, prometheusRailway } from "./prometheus.mjs";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Ruta relativa → contenido esperado. */
export function archivosGenerados() {
    const archivos = {
        "prometheus/prometheus.yml": prometheusRailway(),
        "prometheus/prometheus.local.yml": prometheusLocal(),
    };
    for (const [nombre, dashboard] of Object.entries(construirDashboards())) {
        archivos[`grafana/dashboards/${nombre}`] = `${JSON.stringify(dashboard, null, 2)}\n`;
    }
    return archivos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    for (const [ruta, contenido] of Object.entries(archivosGenerados())) {
        const destino = join(RAIZ, ruta);
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, contenido);
        console.log(`generado ${ruta}`);
    }
}
