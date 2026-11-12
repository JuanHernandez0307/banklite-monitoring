import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { construirDashboards } from "./dashboards.mjs";
import { RAIZ } from "./generar.mjs";
import { ETIQUETAS_PERMITIDAS, METRICAS, METRICAS_NODE } from "./servicios.mjs";

const dashboards = Object.entries(construirDashboards());
const paneles = dashboards.flatMap(([archivo, d]) => d.panels.map(p => ({ archivo, ...p })));
const consultas = paneles.flatMap(p => p.targets.map(t => ({ archivo: p.archivo, titulo: p.title, expr: t.expr })));

// Marcas, empresas y proveedores reales que no pueden aparecer en los dashboards.
const MARCAS =
    /wompi|verifik|maxmind|railway|google|amazon|aws|paypal|stripe|visa|mastercard|nequi|bancolombia|davivienda|\bpse\b/i;
// Datos personales y sensibles: no pueden ser etiquetas ni aparecer en las consultas.
const SENSIBLE =
    /e-?mail|correo|documento|cedula|cédula|passport|pasaporte|iduser|id_user|user_?id|account_?number|card_?number|\bip\b|telefono|teléfono|phone|token|password|clave/i;

test("hay exactamente los cuatro dashboards pedidos", () => {
    assert.deepEqual(dashboards.map(([archivo]) => archivo).sort(), [
        "latencia.json",
        "negocio.json",
        "salud.json",
        "trafico.json",
    ]);
});

test("los archivos de grafana/dashboards son solo esos cuatro", () => {
    assert.deepEqual(
        readdirSync(join(RAIZ, "grafana/dashboards")).sort(),
        dashboards.map(([archivo]) => archivo).sort()
    );
});

test("uid únicos; ids de panel únicos dentro de cada dashboard; no se editan desde la interfaz", () => {
    const uids = dashboards.map(([, d]) => d.uid);
    assert.equal(new Set(uids).size, uids.length);
    for (const [archivo, d] of dashboards) {
        const ids = d.panels.map(p => p.id);
        assert.equal(new Set(ids).size, ids.length, `${archivo}: ids repetidos`);
        assert.equal(d.editable, false);
    }
});

test("todos los paneles y variables usan el datasource provisionado (uid prometheus)", () => {
    for (const p of paneles) {
        assert.equal(p.datasource.uid, "prometheus", `${p.archivo} · ${p.title}`);
        for (const t of p.targets) assert.equal(t.datasource.uid, "prometheus");
    }
    for (const [, d] of dashboards) for (const v of d.templating.list) assert.equal(v.datasource.uid, "prometheus");
});

test("cada consulta usa solo métricas que existen (las de los servicios y las de Node)", () => {
    const conocidas = new Set([
        ...Object.keys(METRICAS),
        ...Object.entries(METRICAS).flatMap(([n, m]) =>
            m.tipo === "histogram" ? [`${n}_bucket`, `${n}_sum`, `${n}_count`] : []
        ),
        ...METRICAS_NODE,
        "up",
    ]);
    const palabras = new Set([
        "sum",
        "rate",
        "increase",
        "count",
        "topk",
        "histogram_quantile",
        "vector",
        "time",
        "by",
        "or",
        "range",
    ]);
    for (const { archivo, titulo, expr } of consultas) {
        // Fuera lo que va entre llaves (selectores), entre corchetes (rangos) y en un `by (...)`.
        const limpia = expr
            .replace(/\{[^}]*\}/g, "")
            .replace(/\[[^\]]*\]/g, "")
            .replace(/\bby \([^)]*\)/g, "");
        for (const nombre of limpia.match(/[a-z_][a-z0-9_]*/g) ?? []) {
            if (palabras.has(nombre)) continue;
            assert.ok(conocidas.has(nombre), `${archivo} · ${titulo}: métrica desconocida «${nombre}»`);
        }
    }
});

test("las etiquetas de las consultas son de la lista cerrada y sin datos personales", () => {
    for (const { archivo, titulo, expr } of consultas) {
        const etiquetas = [
            ...[...expr.matchAll(/\bby \(([^)]*)\)/g)].flatMap(m => m[1].split(",").map(s => s.trim())),
            ...[...expr.matchAll(/([a-z_]+)\s*(?:=~|!=|=)\s*"/g)].map(m => m[1]),
        ].filter(Boolean);
        for (const etiqueta of etiquetas) {
            assert.ok(
                ETIQUETAS_PERMITIDAS.includes(etiqueta),
                `${archivo} · ${titulo}: etiqueta «${etiqueta}» no permitida`
            );
        }
    }
});

test("sin marcas reales ni datos sensibles en ningún dashboard", () => {
    for (const nombre of readdirSync(join(RAIZ, "grafana/dashboards"))) {
        const texto = readFileSync(join(RAIZ, "grafana/dashboards", nombre), "utf8");
        assert.doesNotMatch(texto, MARCAS, `${nombre} menciona una marca real`);
        assert.doesNotMatch(texto, SENSIBLE, `${nombre} menciona datos sensibles`);
    }
});

test("el catálogo de métricas tampoco tiene etiquetas sensibles ni fuera de la lista cerrada", () => {
    for (const [nombre, metrica] of Object.entries(METRICAS)) {
        assert.doesNotMatch(nombre, MARCAS);
        for (const etiqueta of metrica.etiquetas) {
            assert.ok(ETIQUETAS_PERMITIDAS.includes(etiqueta), `${nombre}: etiqueta «${etiqueta}»`);
            assert.doesNotMatch(etiqueta, SENSIBLE);
        }
    }
});

test("el dashboard de salud cubre los 14 servicios con la consulta up", () => {
    const salud = construirDashboards()["salud.json"];
    const expresiones = salud.panels.flatMap(p => p.targets.map(t => t.expr));
    assert.ok(expresiones.includes('sum(up{job="banklite"})'));
    assert.ok(expresiones.includes('up{job="banklite"}'));
});
