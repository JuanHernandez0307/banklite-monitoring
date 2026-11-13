import assert from "node:assert/strict";
import { test } from "node:test";
import { textoMetricas } from "../demo/exportador.mjs";
import { ETIQUETAS_PERMITIDAS, METRICAS, MOTIVOS_RECHAZO_TRANSFERENCIA, SERVICIOS } from "./servicios.mjs";

const MARCAS = /wompi|verifik|maxmind|google|amazon|paypal|stripe|visa|mastercard|nequi|bancolombia|davivienda/i;
const ahora = Date.now() / 1000;

test("el exportador de demostración publica las métricas HTTP y de Node en formato Prometheus", () => {
    const servicio = "ledger-service";
    textoMetricas(servicio, ahora);
    const texto = textoMetricas(servicio, ahora + 60);

    assert.match(texto, /^http_requests_total\{route="[^"]+",method="[A-Z]+",status="\d{3}"\} \d+$/m);
    assert.match(texto, /^http_request_duration_seconds_bucket\{route="[^"]+",method="[A-Z]+",le="\+Inf"\} \d+$/m);
    assert.match(texto, /^http_request_duration_seconds_sum\{/m);
    assert.match(texto, /^process_resident_memory_bytes \d+$/m);
    assert.match(texto, /^nodejs_eventloop_lag_p99_seconds /m);
});

test("los contadores solo crecen entre una consulta y la siguiente", () => {
    const total = texto =>
        [...texto.matchAll(/^http_requests_total\{[^}]*\} (\d+)$/gm)].reduce((suma, m) => suma + Number(m[1]), 0);
    textoMetricas("auth-service", ahora);
    const antes = total(textoMetricas("auth-service", ahora + 30));
    const despues = total(textoMetricas("auth-service", ahora + 60));
    assert.ok(despues >= antes);
});

test("las métricas de negocio salen solo del servicio que las tiene", () => {
    for (const servicio of SERVICIOS) {
        textoMetricas(servicio, ahora);
        const texto = textoMetricas(servicio, ahora + 600);
        for (const [nombre, metrica] of Object.entries(METRICAS)) {
            if (!metrica.servicio) continue;
            const presente = new RegExp(`^${nombre}\\{`, "m").test(texto);
            assert.equal(presente, metrica.servicio === servicio, `${nombre} en ${servicio}`);
        }
    }
});

test("solo usa etiquetas de la lista cerrada y no menciona marcas reales", () => {
    for (const servicio of SERVICIOS) {
        textoMetricas(servicio, ahora);
        const texto = textoMetricas(servicio, ahora + 300);
        assert.doesNotMatch(texto, MARCAS);
        for (const m of texto.matchAll(/([a-z_]+)="/g)) assert.ok(ETIQUETAS_PERMITIDAS.includes(m[1]), m[1]);
    }
});

test("las series de negocio del demo tienen las etiquetas y los valores cerrados del catálogo", () => {
    for (const servicio of SERVICIOS) {
        textoMetricas(servicio, ahora);
        const texto = textoMetricas(servicio, ahora + 120);
        for (const [nombre, metrica] of Object.entries(METRICAS)) {
            if (!metrica.servicio || metrica.servicio !== servicio) continue;
            const lineas = texto.split("\n").filter(l => l.startsWith(`${nombre}{`));
            assert.ok(lineas.length > 0, `${servicio} no publica ${nombre}`);
            for (const linea of lineas) {
                const etiquetas = Object.fromEntries([...linea.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
                assert.deepEqual(Object.keys(etiquetas).sort(), [...metrica.etiquetas].sort(), linea);
                for (const [clave, valor] of Object.entries(etiquetas)) {
                    assert.ok(metrica.valores[clave].includes(valor), `${nombre}: ${clave}="${valor}"`);
                }
            }
        }
    }
});

test("el demo publica todos los motivos de rechazo de transferencias y todas las decisiones de fraude", () => {
    textoMetricas("transfer-service", ahora);
    const transferencias = textoMetricas("transfer-service", ahora + 60);
    for (const motivo of MOTIVOS_RECHAZO_TRANSFERENCIA) assert.match(transferencias, new RegExp(`reason="${motivo}"`));
    textoMetricas("fraud-service", ahora);
    const fraude = textoMetricas("fraud-service", ahora + 60);
    for (const decision of ["review", "confirmed", "dismissed"])
        assert.match(fraude, new RegExp(`decision="${decision}"`));
});
