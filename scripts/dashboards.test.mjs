import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { construirDashboards, GLOSARIO_RECHAZOS } from "./dashboards.mjs";
import { RAIZ } from "./generar.mjs";
import { ETIQUETAS_PERMITIDAS, METRICAS, METRICAS_NODE, MOTIVOS_RECHAZO_TRANSFERENCIA } from "./servicios.mjs";

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

// ---------------------------------------------------------------- Dashboard de negocio

const negocio = construirDashboards()["negocio.json"];
const consultasNegocio = negocio.panels.flatMap(p => p.targets.map(t => ({ titulo: p.title, expr: t.expr })));
const todasLasConsultas = (metrica, lista = consultasNegocio) => lista.filter(c => c.expr.includes(metrica));

test("el dashboard de negocio usa las cuatro métricas de negocio con sus nombres definitivos", () => {
    for (const metrica of [
        "transfers_total",
        "fraud_alerts_total",
        "payment_gateway_payments_total",
        "account_closures_total",
    ]) {
        assert.ok(todasLasConsultas(metrica).length > 0, `ningún panel usa ${metrica}`);
        assert.ok(metrica in METRICAS, `${metrica} no está en el catálogo`);
    }
    // Sin el nombre de ningún proveedor en las consultas.
    assert.ok(!consultasNegocio.some(c => /wompi/i.test(c.expr)));
});

test("la etiqueta reason está permitida y solo la usan las transferencias", () => {
    assert.ok(ETIQUETAS_PERMITIDAS.includes("reason"));
    assert.deepEqual(METRICAS.transfers_total.etiquetas, ["result", "reason"]);
    for (const [archivo, d] of dashboards) {
        for (const p of d.panels) {
            for (const t of p.targets) {
                if (/\breason\b/.test(t.expr)) {
                    assert.ok(
                        t.expr.includes("transfers_total"),
                        `${archivo} · ${p.title}: reason fuera de transfers_total`
                    );
                }
            }
        }
    }
});

test("hay un panel de rechazos de transferencias por motivo (serie y barras) que solo mira los rechazados", () => {
    const porMotivo = negocio.panels.filter(p => p.targets.some(t => t.expr.includes("by (reason)")));
    assert.ok(porMotivo.length >= 2, "faltan los paneles por motivo");
    assert.ok(porMotivo.some(p => p.type === "timeseries"));
    assert.ok(porMotivo.some(p => p.type === "bargauge"));
    for (const p of porMotivo) {
        for (const t of p.targets) assert.match(t.expr, /transfers_total\{result="rejected"\}/, p.title);
        assert.ok(p.targets.every(t => t.legendFormat === "{{reason}}"));
    }
});

test("el glosario explica cada motivo de rechazo (y solo los de la lista cerrada)", () => {
    const glosario = negocio.panels.find(p => p.type === "text");
    assert.ok(glosario, "falta el panel de glosario");
    assert.deepEqual(Object.keys(GLOSARIO_RECHAZOS).sort(), [...MOTIVOS_RECHAZO_TRANSFERENCIA].sort());
    for (const motivo of MOTIVOS_RECHAZO_TRANSFERENCIA) {
        assert.ok(glosario.options.content.includes(`\`${motivo}\``), `el glosario no explica ${motivo}`);
    }
    assert.deepEqual(glosario.targets, []);
});

test("alertas de fraude: toda consulta filtra por decision, y las generadas son decision=review", () => {
    const fraude = todasLasConsultas("fraud_alerts_total");
    assert.ok(fraude.length >= 3);
    for (const c of fraude) assert.match(c.expr, /decision(=|=~)"/, `${c.titulo}: sin filtro por decision`);

    const generadas = negocio.panels.filter(p => /generadas/i.test(p.title));
    assert.equal(generadas.length, 2); // el número y la serie por minuto
    for (const p of generadas) {
        for (const t of p.targets)
            assert.ok(t.expr.includes('decision="review"'), `${p.title}: debe filtrar decision="review"`);
    }

    const resueltas = negocio.panels.filter(p => /resueltas/i.test(p.title));
    assert.equal(resueltas.length, 1);
    for (const t of resueltas[0].targets) assert.match(t.expr, /decision=~"confirmed\|dismissed"/);
});

test("pagos y cierres de cuenta: paneles por resultado, con los valores de la lista cerrada", () => {
    const pagos = negocio.panels.filter(p => p.targets.some(t => t.expr.includes("payment_gateway_payments_total")));
    const cierres = negocio.panels.filter(p => p.targets.some(t => t.expr.includes("account_closures_total")));
    assert.ok(pagos.some(p => p.targets.some(t => t.expr.includes("by (result)"))));
    assert.ok(cierres.some(p => p.targets.some(t => t.expr.includes("by (result)"))));
    for (const metrica of ["payment_gateway_payments_total", "account_closures_total"]) {
        const permitidos = METRICAS[metrica].valores.result;
        for (const c of todasLasConsultas(metrica)) {
            for (const m of c.expr.matchAll(/result(?:=~|=)"([^"]+)"/g)) {
                for (const valor of m[1].split("|"))
                    assert.ok(permitidos.includes(valor), `${metrica}: valor ${valor}`);
            }
        }
    }
});

test("los valores de etiqueta que usan las consultas están en las listas cerradas del catálogo", () => {
    for (const { titulo, expr } of consultas) {
        for (const metrica of Object.keys(METRICAS)) {
            if (!expr.includes(metrica)) continue;
            const valores = METRICAS[metrica].valores ?? {};
            for (const m of expr.matchAll(/(result|reason|level|decision)(?:=~|=)"([^"]+)"/g)) {
                if (!(m[1] in valores)) continue;
                for (const valor of m[2].split("|"))
                    assert.ok(valores[m[1]].includes(valor), `${titulo}: ${m[1]}="${valor}"`);
            }
        }
    }
});

test("los porcentajes de error muestran 0 (no «sin datos») cuando no hay errores", () => {
    const trafico = construirDashboards()["trafico.json"];
    const errores = trafico.panels.filter(p => /Errores [45]xx/.test(p.title));
    assert.equal(errores.length, 2);
    for (const p of errores)
        assert.match(
            p.targets[0].expr,
            / or sum by \(service\) \(rate\(http_requests_total\{service=~"\$servicio"\}\[5m\]\)\) \* 0$/
        );
});

test("toda consulta tiene paréntesis, corchetes, llaves y comillas balanceados (sanidad de la sintaxis de PromQL)", () => {
    for (const { archivo, titulo, expr } of consultas) {
        const pila = [];
        const pares = { ")": "(", "]": "[", "}": "{" };
        let comillas = 0;
        for (const c of expr) {
            if (c === '"') comillas++;
            else if ("([{".includes(c)) pila.push(c);
            else if (c in pares) assert.equal(pila.pop(), pares[c], `${archivo} · ${titulo}: ${expr}`);
        }
        assert.equal(pila.length, 0, `${archivo} · ${titulo}: sin cerrar`);
        assert.equal(comillas % 2, 0, `${archivo} · ${titulo}: comillas`);
        assert.ok(!/\bby \(\s*\)/.test(expr), `${archivo} · ${titulo}: by () vacío`);
    }
});
