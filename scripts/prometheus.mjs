import { PUERTO_DEMO, PUERTO_METRICAS, RUTA_METRICAS, SERVICIOS } from "./servicios.mjs";

const CABECERA = `# Generado por scripts/generar.mjs: no se edita a mano (npm run generar).
global:
    scrape_interval: 30s
    scrape_timeout: 10s
    evaluation_interval: 30s
`;

/** prometheus.yml de Railway: cada servicio por su dirección privada, puerto 9100. */
export function prometheusRailway() {
    const destinos = SERVICIOS.map(
        servicio => `            - targets: ["${servicio}.railway.internal:${PUERTO_METRICAS}"]
              labels:
                  service: ${servicio}`
    ).join("\n");
    return `${CABECERA}
scrape_configs:
    - job_name: banklite
      metrics_path: ${RUTA_METRICAS}
      static_configs:
${destinos}

    # Prometheus se vigila a sí mismo (no cuenta como servicio de BankLite).
    - job_name: prometheus
      static_configs:
          - targets: ["localhost:9090"]
`;
}

/** prometheus.local.yml de docker-compose: todos los servicios son el exportador de demostración. */
export function prometheusLocal() {
    const destinos = SERVICIOS.map(
        servicio => `            - targets: ["demo-metricas:${PUERTO_DEMO}"]
              labels:
                  service: ${servicio}
                  __metrics_path__: /${servicio}${RUTA_METRICAS}`
    ).join("\n");
    return `${CABECERA}
scrape_configs:
    - job_name: banklite
      static_configs:
${destinos}

    - job_name: prometheus
      static_configs:
          - targets: ["localhost:9090"]
`;
}
