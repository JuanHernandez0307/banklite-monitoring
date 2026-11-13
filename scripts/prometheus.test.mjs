import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";
import { prometheusLocal, prometheusRailway } from "./prometheus.mjs";
import { PUERTO_METRICAS, SERVICIOS } from "./servicios.mjs";

const destinos = config => config.scrape_configs.find(job => job.job_name === "banklite").static_configs;

test("son 14 servicios distintos: los 13 de atrás del gateway más el gateway", () => {
    assert.equal(SERVICIOS.length, 14);
    assert.equal(new Set(SERVICIOS).size, 14);
    assert.ok(SERVICIOS.includes("api-gateway"));
});

test("Railway: cada servicio se consulta por su dirección privada, en el puerto de métricas y con su etiqueta", () => {
    const config = parse(prometheusRailway());
    const lista = destinos(config);

    assert.equal(lista.length, 14);
    for (const servicio of SERVICIOS) {
        const entrada = lista.find(d => d.labels.service === servicio);
        assert.ok(entrada, `falta ${servicio}`);
        assert.deepEqual(entrada.targets, [`${servicio}.railway.internal:${PUERTO_METRICAS}`]);
    }
    assert.equal(config.scrape_configs.find(job => job.job_name === "banklite").metrics_path, "/metrics");
});

test("nada apunta a internet: solo direcciones privadas de Railway y el propio Prometheus", () => {
    const config = parse(prometheusRailway());
    const todos = config.scrape_configs.flatMap(job => job.static_configs.flatMap(d => d.targets));
    for (const destino of todos) {
        assert.match(destino, /^([a-z-]+\.railway\.internal:9100|localhost:9090)$/, destino);
    }
});

test("el scrape es cada 30 s", () => {
    const config = parse(prometheusRailway());
    assert.equal(config.global.scrape_interval, "30s");
});

test("local: los 14 servicios salen del exportador de demostración, cada uno en su ruta", () => {
    const lista = destinos(parse(prometheusLocal()));
    assert.equal(lista.length, 14);
    for (const d of lista) {
        assert.deepEqual(d.targets, ["demo-metricas:9200"]);
        assert.equal(d.labels.__metrics_path__, `/${d.labels.service}/metrics`);
    }
});
