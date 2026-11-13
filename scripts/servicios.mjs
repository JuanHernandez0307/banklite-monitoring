// Los 14 servicios que Prometheus consulta (los 13 de atrás del gateway más el propio gateway).
// El nombre es el del servicio en Railway: su dirección privada es <nombre>.railway.internal.
export const SERVICIOS = [
    "api-gateway",
    "auth-service",
    "account-service",
    "kyc-service",
    "notification-service",
    "ledger-service",
    "card-service",
    "transfer-service",
    "fraud-service",
    "compliance-service",
    "payment-service",
    "rewards-service",
    "savings-service",
    "deposit-service",
];

// Puerto de métricas de cada servicio: solo se alcanza por la red privada (Railway solo
// publica el PORT de los servicios que tienen dominio).
export const PUERTO_METRICAS = 9100;
export const RUTA_METRICAS = "/metrics";

// Puerto del exportador de demostración (solo docker-compose local).
export const PUERTO_DEMO = 9200;

// Métricas que exponen los servicios. Los dashboards solo pueden usar estas.
export const METRICAS = {
    // HTTP (todos los servicios). La etiqueta `service` la pone Prometheus al consultar.
    http_requests_total: { tipo: "counter", etiquetas: ["route", "method", "status"] },
    http_request_duration_seconds: { tipo: "histogram", etiquetas: ["route", "method"] },
    // De negocio (cada una en un solo servicio)
    transfers_total: { tipo: "counter", etiquetas: ["result"], servicio: "transfer-service" },
    fraud_alerts_total: { tipo: "counter", etiquetas: ["level", "decision"], servicio: "fraud-service" },
    payment_gateway_payments_total: { tipo: "counter", etiquetas: ["result"], servicio: "deposit-service" },
    account_closures_total: { tipo: "counter", etiquetas: ["result"], servicio: "account-service" },
};

// Métricas por defecto de Node (prom-client) que usan los dashboards.
export const METRICAS_NODE = [
    "process_cpu_seconds_total",
    "process_resident_memory_bytes",
    "process_start_time_seconds",
    "nodejs_eventloop_lag_p99_seconds",
];

// Etiquetas permitidas en consultas y en métricas: listas cerradas y sin datos personales.
export const ETIQUETAS_PERMITIDAS = [
    "service",
    "route",
    "method",
    "status",
    "result",
    "level",
    "decision",
    "le",
    "job",
    "instance",
];
