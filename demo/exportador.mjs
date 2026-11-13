// Exportador de DEMOSTRACIÓN para docker-compose: publica métricas inventadas con los mismos
// nombres y etiquetas que los servicios reales, para ver los dashboards sin Railway.
// Todo es ficticio: ninguna cifra corresponde a una operación real.
// Rutas: /<servicio>/metrics (una por servicio). Puerto: PUERTO_DEMO (9200).
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { MOTIVOS_RECHAZO_TRANSFERENCIA, PUERTO_DEMO, SERVICIOS } from "../scripts/servicios.mjs";

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const RUTAS = {
    default: ["/health", "/items", "/items/:id"],
    "api-gateway": ["/health", "/auth/login", "/accounts"],
    "ledger-service": ["/ledger/balance", "/ledger/movements", "/ledger/internal/transfers"],
    "transfer-service": ["/transfers", "/transfers/:id", "/transfers/quote"],
};
// Estado por servicio: contadores que solo crecen, como los reales.
const estado = new Map();
const INICIO = Date.now() / 1000;

// Generador pseudoaleatorio con semilla (resultados repetibles).
function aleatorio(semilla) {
    let s = semilla >>> 0 || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function semillaDe(texto) {
    let h = 7;
    for (const c of texto) h = (Math.imul(h, 31) + c.codePointAt(0)) >>> 0;
    return h;
}

function estadoDe(servicio) {
    if (!estado.has(servicio)) {
        estado.set(servicio, {
            ultima: Date.now() / 1000,
            azar: aleatorio(semillaDe(servicio)),
            http: new Map(),
            duracion: new Map(),
            negocio: new Map(),
            cpu: 0,
        });
    }
    return estado.get(servicio);
}

const incrementar = (mapa, clave, valor) => mapa.set(clave, (mapa.get(clave) ?? 0) + valor);

/** Avanza el estado del servicio hasta `ahora` (segundos) y devuelve el texto de métricas. */
export function textoMetricas(servicio, ahora = Date.now() / 1000) {
    const e = estadoDe(servicio);
    // Tope de 10 min por consulta: si el reloj salta, no se generan millones de peticiones de golpe.
    const dt = Math.min(600, Math.max(0, ahora - e.ultima));
    e.ultima = ahora;
    const rutas = RUTAS[servicio] ?? RUTAS.default;
    const base = 2 + (semillaDe(servicio) % 7);

    for (const ruta of rutas) {
        const metodo = ruta.includes("quote") || ruta.includes("login") ? "POST" : "GET";
        const lentitud = 0.01 + (semillaDe(servicio + ruta) % 40) / 200;
        const peticiones = Math.round(base * dt * (0.6 + e.azar() * 0.8));
        for (let i = 0; i < peticiones; i++) {
            const r = e.azar();
            const status = r < 0.93 ? "200" : r < 0.97 ? "400" : r < 0.99 ? "404" : "500";
            incrementar(e.http, `${ruta}|${metodo}|${status}`, 1);
            const segundos = lentitud * (0.4 + e.azar() * 2.2) * (e.azar() > 0.97 ? 8 : 1);
            const clave = `${ruta}|${metodo}`;
            const h = e.duracion.get(clave) ?? { buckets: BUCKETS.map(() => 0), suma: 0, cuenta: 0 };
            BUCKETS.forEach((limite, k) => {
                if (segundos <= limite) h.buckets[k] += 1;
            });
            h.suma += segundos;
            h.cuenta += 1;
            e.duracion.set(clave, h);
        }
    }

    // Series de negocio con las mismas etiquetas y valores cerrados que los servicios reales.
    // [serie, eventos por segundo]
    const negocio = {
        "transfer-service": [
            ['transfers_total{result="completed",reason="none"}', 0.5],
            ...MOTIVOS_RECHAZO_TRANSFERENCIA.map((motivo, i) => [
                `transfers_total{result="rejected",reason="${motivo}"}`,
                i === 10 ? 0.04 : i === 9 ? 0.02 : i === 11 ? 0.01 : 0.002,
            ]),
        ],
        "fraud-service": [
            ['fraud_alerts_total{level="medium",decision="review"}', 0.05],
            ['fraud_alerts_total{level="high",decision="review"}', 0.015],
            ['fraud_alerts_total{level="medium",decision="confirmed"}', 0.01],
            ['fraud_alerts_total{level="high",decision="confirmed"}', 0.008],
            ['fraud_alerts_total{level="medium",decision="dismissed"}', 0.02],
            ['fraud_alerts_total{level="high",decision="dismissed"}', 0.003],
        ],
        "deposit-service": [
            ['payment_gateway_payments_total{result="approved"}', 0.25],
            ['payment_gateway_payments_total{result="declined"}', 0.04],
            ['payment_gateway_payments_total{result="voided"}', 0.005],
            ['payment_gateway_payments_total{result="error"}', 0.01],
        ],
        "account-service": [
            ['account_closures_total{result="completed"}', 0.01],
            ['account_closures_total{result="requirements"}', 0.02],
            ['account_closures_total{result="error"}', 0.002],
        ],
    }[servicio];
    for (const [serie, tasa] of negocio ?? []) incrementar(e.negocio, serie, Math.round(tasa * dt * (0.5 + e.azar())));
    e.cpu += dt * (0.02 + e.azar() * 0.05);

    const l = [];
    l.push("# TYPE http_requests_total counter");
    for (const [clave, valor] of e.http) {
        const [route, method, status] = clave.split("|");
        l.push(`http_requests_total{route="${route}",method="${method}",status="${status}"} ${valor}`);
    }
    l.push("# TYPE http_request_duration_seconds histogram");
    for (const [clave, h] of e.duracion) {
        const [route, method] = clave.split("|");
        BUCKETS.forEach((limite, k) =>
            l.push(
                `http_request_duration_seconds_bucket{route="${route}",method="${method}",le="${limite}"} ${h.buckets[k]}`
            )
        );
        l.push(`http_request_duration_seconds_bucket{route="${route}",method="${method}",le="+Inf"} ${h.cuenta}`);
        l.push(`http_request_duration_seconds_sum{route="${route}",method="${method}"} ${h.suma.toFixed(6)}`);
        l.push(`http_request_duration_seconds_count{route="${route}",method="${method}"} ${h.cuenta}`);
    }
    for (const [serie, valor] of e.negocio) l.push(`${serie} ${valor}`);
    l.push("# TYPE process_cpu_seconds_total counter", `process_cpu_seconds_total ${e.cpu.toFixed(3)}`);
    l.push(
        "# TYPE process_resident_memory_bytes gauge",
        `process_resident_memory_bytes ${Math.round(90e6 + (semillaDe(servicio) % 60) * 1e6)}`
    );
    l.push("# TYPE process_start_time_seconds gauge", `process_start_time_seconds ${INICIO.toFixed(0)}`);
    l.push(
        "# TYPE nodejs_eventloop_lag_p99_seconds gauge",
        `nodejs_eventloop_lag_p99_seconds ${(0.002 + e.azar() * 0.012).toFixed(5)}`
    );
    return `${l.join("\n")}\n`;
}

export function iniciar(puerto = PUERTO_DEMO) {
    const servidor = createServer((req, res) => {
        const servicio = SERVICIOS.find(s => req.url === `/${s}/metrics`);
        if (req.method !== "GET" || !servicio) {
            res.writeHead(404).end("no existe\n");
            return;
        }
        res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" }).end(textoMetricas(servicio));
    });
    return new Promise(resolver => servidor.listen(puerto, () => resolver(servidor)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    await iniciar();
    console.log(`Exportador de demostración en el puerto ${PUERTO_DEMO} (datos ficticios)`);
}
