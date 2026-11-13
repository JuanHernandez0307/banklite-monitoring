// Constructor de los dashboards de Grafana (JSON generado, nunca a mano).
// Sin marcas ni logos reales y sin etiquetas con datos personales: scripts/dashboards.test.mjs lo comprueba.

const DS = { type: "prometheus", uid: "prometheus" };

let siguienteId = 1;
const reiniciarIds = () => {
    siguienteId = 1;
};

const objetivo = (expr, leyenda, extra = {}) => ({ refId: "A", datasource: DS, expr, legendFormat: leyenda, ...extra });

function panel({
    tipo,
    titulo,
    descripcion,
    x,
    y,
    w,
    h,
    objetivos,
    unidad,
    opciones = {},
    campos = {},
    anulaciones = [],
}) {
    return {
        id: siguienteId++,
        type: tipo,
        title: titulo,
        description: descripcion ?? "",
        datasource: DS,
        gridPos: { x, y, w, h },
        targets: objetivos.map((o, i) => ({ ...o, refId: String.fromCharCode(65 + i) })),
        fieldConfig: { defaults: { unit: unidad ?? "short", ...campos }, overrides: anulaciones },
        options: opciones,
    };
}

const serie = (titulo, expr, leyenda, pos, unidad, descripcion, extra = {}) =>
    panel({
        tipo: "timeseries",
        titulo,
        descripcion,
        ...pos,
        unidad,
        objetivos: [objetivo(expr, leyenda)],
        campos: { custom: { lineWidth: 1, fillOpacity: 10, showPoints: "never", ...extra.custom } },
        opciones: {
            legend: { displayMode: "table", placement: "bottom", calcs: ["lastNotNull", "max"] },
            tooltip: { mode: "multi" },
        },
    });

const numero = (titulo, expr, pos, { unidad = "short", umbrales, descripcion, color = "value" } = {}) =>
    panel({
        tipo: "stat",
        titulo,
        descripcion,
        ...pos,
        unidad,
        objetivos: [objetivo(expr, "", { instant: true })],
        campos: {
            thresholds: { mode: "absolute", steps: umbrales ?? [{ color: "blue", value: null }] },
            color: { mode: "thresholds" },
        },
        opciones: {
            colorMode: color,
            graphMode: "none",
            reduceOptions: { calcs: ["lastNotNull"], fields: "", values: false },
        },
    });

function tablero({ uid, titulo, descripcion, etiquetas, variables = [], paneles }) {
    return {
        uid,
        title: titulo,
        description: descripcion,
        tags: ["banklite", ...etiquetas],
        timezone: "browser",
        editable: false,
        graphTooltip: 1,
        schemaVersion: 39,
        version: 1,
        refresh: "30s",
        time: { from: "now-6h", to: "now" },
        templating: { list: variables },
        annotations: { list: [] },
        links: [],
        panels: paneles,
    };
}

const variableServicio = {
    name: "servicio",
    label: "Servicio",
    type: "query",
    datasource: DS,
    query: { query: 'label_values(up{job="banklite"}, service)', refId: "servicio" },
    definition: 'label_values(up{job="banklite"}, service)',
    refresh: 2,
    sort: 1,
    multi: true,
    includeAll: true,
    allValue: ".*",
    current: { selected: true, text: "All", value: "$__all" },
};

const variableUnServicio = {
    ...variableServicio,
    name: "uno",
    label: "Servicio",
    multi: false,
    includeAll: false,
    allValue: null,
    current: { selected: false, text: "ledger-service", value: "ledger-service" },
};

const sinDatos = { noValue: "—" };

// ---------------------------------------------------------------- Salud

function salud() {
    reiniciarIds();
    const verdeRojo = [
        { color: "red", value: null },
        { color: "green", value: 1 },
    ];
    return tablero({
        uid: "banklite-salud",
        titulo: "Salud de los servicios",
        descripcion: "¿Cada servicio responde a Prometheus? Arriba (verde) o caído (rojo).",
        etiquetas: ["salud"],
        paneles: [
            numero(
                "Servicios arriba",
                'sum(up{job="banklite"})',
                { x: 0, y: 0, w: 6, h: 5 },
                {
                    descripcion: "De los 14 servicios (13 más el api-gateway).",
                    umbrales: [
                        { color: "red", value: null },
                        { color: "orange", value: 12 },
                        { color: "green", value: 14 },
                    ],
                }
            ),
            numero(
                "Servicios caídos",
                'count(up{job="banklite"} == 0) or vector(0)',
                { x: 6, y: 0, w: 6, h: 5 },
                {
                    umbrales: [
                        { color: "green", value: null },
                        { color: "red", value: 1 },
                    ],
                }
            ),
            numero(
                "Peticiones por segundo (total)",
                'sum(rate(http_requests_total{job="banklite"}[5m]))',
                { x: 12, y: 0, w: 6, h: 5 },
                { unidad: "reqps" }
            ),
            numero(
                "Errores 5xx (últimos 5 min)",
                'sum(increase(http_requests_total{job="banklite",status=~"5.."}[5m])) or vector(0)',
                { x: 18, y: 0, w: 6, h: 5 },
                {
                    umbrales: [
                        { color: "green", value: null },
                        { color: "orange", value: 1 },
                        { color: "red", value: 10 },
                    ],
                }
            ),
            panel({
                tipo: "state-timeline",
                titulo: "Estado de cada servicio",
                descripcion: "Una fila por servicio: verde = Prometheus lo consulta bien; rojo = no responde.",
                x: 0,
                y: 5,
                w: 24,
                h: 9,
                unidad: "short",
                objetivos: [objetivo('up{job="banklite"}', "{{service}}")],
                campos: {
                    ...sinDatos,
                    color: { mode: "thresholds" },
                    thresholds: { mode: "absolute", steps: verdeRojo },
                    mappings: [
                        {
                            type: "value",
                            options: {
                                0: { text: "Caído", color: "red", index: 0 },
                                1: { text: "Arriba", color: "green", index: 1 },
                            },
                        },
                    ],
                    custom: { fillOpacity: 80, lineWidth: 0 },
                },
                opciones: { mergeValues: true, showValue: "never", rowHeight: 0.8, legend: { showLegend: false } },
            }),
            panel({
                tipo: "bargauge",
                titulo: "Tiempo en línea desde el último reinicio",
                descripcion: "Un valor bajo en un servicio indica que se reinició hace poco.",
                x: 0,
                y: 14,
                w: 12,
                h: 10,
                unidad: "s",
                objetivos: [
                    objetivo('time() - process_start_time_seconds{job="banklite"}', "{{service}}", { instant: true }),
                ],
                campos: {
                    thresholds: {
                        mode: "absolute",
                        steps: [
                            { color: "orange", value: null },
                            { color: "green", value: 600 },
                        ],
                    },
                },
                opciones: {
                    displayMode: "gradient",
                    orientation: "horizontal",
                    reduceOptions: { calcs: ["lastNotNull"], fields: "", values: false },
                },
            }),
            serie(
                "Memoria de cada servicio",
                'process_resident_memory_bytes{job="banklite"}',
                "{{service}}",
                { x: 12, y: 14, w: 12, h: 10 },
                "bytes",
                "Memoria residente del proceso de Node."
            ),
        ],
    });
}

// ---------------------------------------------------------------- Tráfico y errores

function trafico() {
    reiniciarIds();
    return tablero({
        uid: "banklite-trafico",
        titulo: "Tráfico y errores",
        descripcion: "Peticiones por segundo, errores 4xx y 5xx y las rutas más usadas.",
        etiquetas: ["trafico"],
        variables: [variableServicio],
        paneles: [
            serie(
                "Peticiones por segundo",
                'sum by (service) (rate(http_requests_total{service=~"$servicio"}[5m]))',
                "{{service}}",
                { x: 0, y: 0, w: 12, h: 9 },
                "reqps"
            ),
            serie(
                "Códigos de estado",
                'sum by (status) (rate(http_requests_total{service=~"$servicio"}[5m]))',
                "{{status}}",
                { x: 12, y: 0, w: 12, h: 9 },
                "reqps",
                "Respuestas por segundo según el código HTTP.",
                { custom: { stacking: { mode: "normal", group: "A" }, fillOpacity: 40 } }
            ),
            serie(
                "Errores 5xx (% de las peticiones)",
                'sum by (service) (rate(http_requests_total{service=~"$servicio",status=~"5.."}[5m])) / sum by (service) (rate(http_requests_total{service=~"$servicio"}[5m]))',
                "{{service}}",
                { x: 0, y: 9, w: 12, h: 9 },
                "percentunit",
                "Fallos del servidor. Debería ser casi siempre 0."
            ),
            serie(
                "Errores 4xx (% de las peticiones)",
                'sum by (service) (rate(http_requests_total{service=~"$servicio",status=~"4.."}[5m])) / sum by (service) (rate(http_requests_total{service=~"$servicio"}[5m]))',
                "{{service}}",
                { x: 12, y: 9, w: 12, h: 9 },
                "percentunit",
                "Peticiones rechazadas por validación, sesión o permisos."
            ),
            panel({
                tipo: "table",
                titulo: "Rutas más usadas (10)",
                descripcion: "Plantilla de la ruta, sin identificadores.",
                x: 0,
                y: 18,
                w: 24,
                h: 10,
                unidad: "reqps",
                objetivos: [
                    objetivo(
                        'topk(10, sum by (service, route) (rate(http_requests_total{service=~"$servicio"}[5m])))',
                        "",
                        { instant: true, format: "table" }
                    ),
                ],
                campos: {},
                opciones: { showHeader: true, sortBy: [{ displayName: "Value", desc: true }] },
                anulaciones: [],
            }),
        ],
    });
}

// ---------------------------------------------------------------- Latencia

function latencia() {
    reiniciarIds();
    const p = (q, selector, agrupar) =>
        `histogram_quantile(${q}, sum by (le${agrupar}) (rate(http_request_duration_seconds_bucket{${selector}}[5m])))`;
    return tablero({
        uid: "banklite-latencia",
        titulo: "Latencia p95",
        descripcion: "Tiempo de respuesta: el 95 % de las peticiones tarda menos que este valor.",
        etiquetas: ["latencia"],
        variables: [variableServicio, variableUnServicio],
        paneles: [
            serie(
                "p95 por servicio",
                p(0.95, 'service=~"$servicio"', ", service"),
                "{{service}}",
                { x: 0, y: 0, w: 24, h: 10 },
                "s",
                "Percentil 95 de la duración de las peticiones, por servicio."
            ),
            serie(
                "p50, p95 y p99 del servicio elegido",
                p(0.5, 'service="$uno"', ""),
                "p50",
                { x: 0, y: 10, w: 12, h: 9 },
                "s",
                "Elige el servicio en «Servicio» (segundo selector)."
            ),
            serie(
                "p95 de las rutas más lentas del servicio elegido",
                `topk(8, ${p(0.95, 'service="$uno"', ", route")})`,
                "{{route}}",
                { x: 12, y: 10, w: 12, h: 9 },
                "s"
            ),
            serie(
                "Retraso del event loop (p99)",
                'nodejs_eventloop_lag_p99_seconds{service=~"$servicio"}',
                "{{service}}",
                { x: 0, y: 19, w: 12, h: 8 },
                "s",
                "Si sube, el proceso está saturado."
            ),
            serie(
                "CPU",
                'rate(process_cpu_seconds_total{service=~"$servicio"}[5m])',
                "{{service}}",
                { x: 12, y: 19, w: 12, h: 8 },
                "percentunit",
                "Fracción de un núcleo en uso."
            ),
        ].map(ajustarPercentiles),
    });
}

// Agrega p95 y p99 a la serie del servicio elegido (mismo panel, tres consultas).
function ajustarPercentiles(panelBase) {
    if (panelBase.title !== "p50, p95 y p99 del servicio elegido") return panelBase;
    const q = (n, etiqueta) => ({
        refId: "",
        datasource: DS,
        expr: `histogram_quantile(${n}, sum by (le) (rate(http_request_duration_seconds_bucket{service="$uno"}[5m])))`,
        legendFormat: etiqueta,
    });
    const targets = [q(0.5, "p50"), q(0.95, "p95"), q(0.99, "p99")].map((t, i) => ({
        ...t,
        refId: String.fromCharCode(65 + i),
    }));
    return { ...panelBase, targets };
}

// ---------------------------------------------------------------- Negocio

function negocio() {
    reiniciarIds();
    const periodo = "$__range";
    return tablero({
        uid: "banklite-negocio",
        titulo: "Métricas de negocio",
        descripcion: "Transferencias, alertas de fraude, pagos con la pasarela y cierres de cuenta.",
        etiquetas: ["negocio"],
        paneles: [
            numero(
                "Transferencias exitosas",
                `sum(increase(transfers_total{result="completed"}[${periodo}])) or vector(0)`,
                { x: 0, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "green", value: null }], descripcion: "En el rango de tiempo elegido." }
            ),
            numero(
                "Transferencias rechazadas",
                `sum(increase(transfers_total{result="rejected"}[${periodo}])) or vector(0)`,
                { x: 4, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "orange", value: null }] }
            ),
            numero(
                "Alertas de fraude",
                `sum(increase(fraud_alerts_total[${periodo}])) or vector(0)`,
                { x: 8, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "orange", value: null }] }
            ),
            numero(
                "Pagos aprobados",
                `sum(increase(payment_gateway_payments_total{result="approved"}[${periodo}])) or vector(0)`,
                { x: 12, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "green", value: null }], descripcion: "Pasarela de pagos en modo de pruebas." }
            ),
            numero(
                "Pagos rechazados",
                `sum(increase(payment_gateway_payments_total{result=~"declined|voided|error"}[${periodo}])) or vector(0)`,
                { x: 16, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "orange", value: null }] }
            ),
            numero(
                "Cuentas cerradas",
                `sum(increase(account_closures_total{result="completed"}[${periodo}])) or vector(0)`,
                { x: 20, y: 0, w: 4, h: 4 },
                { umbrales: [{ color: "blue", value: null }] }
            ),
            serie(
                "Transferencias por minuto",
                "sum by (result) (rate(transfers_total[5m])) * 60",
                "{{result}}",
                { x: 0, y: 4, w: 12, h: 9 },
                "short",
                "Completadas y rechazadas."
            ),
            serie(
                "Alertas de fraude por minuto",
                "sum by (level, decision) (rate(fraud_alerts_total[5m])) * 60",
                "{{level}} · {{decision}}",
                { x: 12, y: 4, w: 12, h: 9 },
                "short",
                "Por nivel de riesgo y decisión."
            ),
            serie(
                "Pagos con la pasarela por minuto",
                "sum by (result) (rate(payment_gateway_payments_total[5m])) * 60",
                "{{result}}",
                { x: 0, y: 13, w: 12, h: 9 },
                "short",
                "Aprobados, rechazados, anulados y con error."
            ),
            serie(
                "Cierres de cuenta por hora",
                "sum by (result) (rate(account_closures_total[15m])) * 3600",
                "{{result}}",
                { x: 12, y: 13, w: 12, h: 9 },
                "short",
                "Completados, con requisitos pendientes y con error."
            ),
        ],
    });
}

/** Nombre de archivo → dashboard. */
export function construirDashboards() {
    return {
        "salud.json": salud(),
        "trafico.json": trafico(),
        "latencia.json": latencia(),
        "negocio.json": negocio(),
    };
}
