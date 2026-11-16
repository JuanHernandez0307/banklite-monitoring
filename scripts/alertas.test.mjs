import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "yaml";
import { RAIZ } from "./generar.mjs";
import { prometheusLocal, prometheusRailway } from "./prometheus.mjs";

const leer = ruta => readFileSync(`${RAIZ}/${ruta}`, "utf8");
const reglas = parse(leer("prometheus/alertas.yml")).groups.flatMap(grupo => grupo.rules);
const porNombre = nombre => reglas.find(regla => regla.alert === nombre);

test("están las tres alertas: servicio caído, errores 5xx y latencia p95", () => {
    assert.deepEqual(reglas.map(regla => regla.alert).sort(), [
        "LatenciaP95Alta",
        "ServicioCaido",
        "TasaErrores5xxAlta",
    ]);
});

test("servicio caído: up == 0 de los servicios de BankLite durante 2 minutos", () => {
    const regla = porNombre("ServicioCaido");
    assert.match(regla.expr, /up\{job="banklite"\}\s*==\s*0/);
    assert.equal(regla.for, "2m");
    assert.equal(regla.labels.severity, "critical");
});

test("5xx y latencia usan las métricas que ya existen y no saltan sin tráfico", () => {
    const errores = porNombre("TasaErrores5xxAlta").expr;
    assert.match(errores, /http_requests_total\{status=~"5\.\."\}/);
    assert.match(errores, /and sum by \(service\)/);
    const latencia = porNombre("LatenciaP95Alta").expr;
    assert.match(latencia, /histogram_quantile\(0\.95, .*http_request_duration_seconds_bucket/);
    assert.match(latencia, /and sum by \(service\)/);
});

test("cada alerta dice qué servicio es y tiene resumen", () => {
    for (const regla of reglas) {
        assert.ok(regla.annotations.summary.includes("$labels.service"), regla.alert);
        assert.ok(regla.annotations.description, regla.alert);
    }
});

test("prometheus.yml (Railway y local) carga el archivo de reglas y la imagen lo copia", () => {
    for (const config of [prometheusRailway(), prometheusLocal()]) {
        assert.deepEqual(parse(config).rule_files, ["/etc/prometheus/alertas.yml"]);
    }
    assert.match(leer("prometheus/Dockerfile"), /COPY prometheus\/alertas\.yml \/etc\/prometheus\/alertas\.yml/);
    assert.match(leer("docker-compose.yml"), /\.\/prometheus\/alertas\.yml:\/etc\/prometheus\/alertas\.yml/);
});
