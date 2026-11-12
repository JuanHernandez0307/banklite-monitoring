# banklite-monitoring

Prometheus y Grafana de BankLite: la configuración, los dashboards como archivos y las imágenes de los dos servicios. Es una herramienta de monitoreo académico; los datos son ficticios.

```
servicios (14)  ──/metrics, puerto 9100, red privada──►  Prometheus  ──►  Grafana (login)
```

## Qué hay aquí

| Ruta                                                  | Qué es                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `prometheus/prometheus.yml`                           | Configuración para Railway: los 14 servicios por `<servicio>.railway.internal:9100`, cada 30 s. Generado.   |
| `prometheus/prometheus.local.yml`                     | La misma, apuntando al exportador de demostración (docker-compose). Generado.                               |
| `prometheus/Dockerfile`, `railway.json`               | Imagen de Prometheus: guarda 7 días o 2 GB, datos en `/prometheus` (volumen).                               |
| `grafana/Dockerfile`, `entrypoint.sh`, `railway.json` | Imagen de Grafana: sin acceso anónimo ni registro público; **no arranca sin usuario y contraseña propios**. |
| `grafana/provisioning/`                               | Datasource y proveedor de dashboards como archivos.                                                         |
| `grafana/dashboards/`                                 | Los cuatro dashboards (JSON generado): salud, tráfico y errores, latencia p95, negocio.                     |
| `scripts/`                                            | Generador, pruebas (`node --test`) y `probar-imagenes.sh` (la corre el pipeline).                           |
| `demo/exportador.mjs`                                 | Métricas **ficticias** con los mismos nombres que las reales, para ver los dashboards sin Railway.          |
| `docker-compose.yml`                                  | Respaldo local: Prometheus + Grafana + exportador de demostración.                                          |

Los archivos «Generado» salen de `scripts/` (`npm run generar`); una prueba comprueba que lo versionado coincide con el generador. Para cambiar un dashboard o la lista de servicios se edita el generador, no el JSON.

## Métricas que esperan los dashboards

Cada servicio publica `/metrics` en el puerto `9100` (solo red privada). Prometheus agrega la etiqueta `service`.

| Métrica                                            | Etiquetas                                           |
| -------------------------------------------------- | --------------------------------------------------- |
| `http_requests_total`                              | `route` (plantilla, sin ids), `method`, `status`    |
| `http_request_duration_seconds` (histograma)       | `route`, `method`                                   |
| `process_*` y `nodejs_*` (prom-client)             | —                                                   |
| `transfers_total` (transfer-service)               | `result`: `completed`, `rejected`                   |
| `fraud_alerts_total` (fraud-service)               | `level`, `decision`                                 |
| `payment_gateway_payments_total` (deposit-service) | `result`: `approved`, `declined`, `voided`, `error` |
| `account_closures_total` (account-service)         | `result`: `completed`, `requirements`, `error`      |

Las etiquetas son de lista cerrada: nunca llevan correos, documentos, IPs, ids de usuario ni de cuenta. `scripts/dashboards.test.mjs` lo comprueba en los dashboards.

## Verlo en local (docker-compose)

```bash
cp .env.example .env        # define GRAFANA_PASSWORD (12 caracteres o más)
docker compose up --build
```

Grafana queda en <http://localhost:3000> (solo en tu máquina) con el usuario y la contraseña de tu `.env`. Los datos son del exportador de demostración.

## Variables en Railway (solo nombres)

| Servicio   | Variable                     | Para qué                                                         |
| ---------- | ---------------------------- | ---------------------------------------------------------------- |
| Grafana    | `GF_SECURITY_ADMIN_USER`     | Usuario administrador.                                           |
| Grafana    | `GF_SECURITY_ADMIN_PASSWORD` | Contraseña (12+ caracteres).                                     |
| Grafana    | `PROMETHEUS_URL`             | Opcional; por defecto `http://prometheus.railway.internal:9090`. |
| Prometheus | —                            | Sin variables secretas.                                          |

Los valores no van en el repositorio ni en el chat.

## Pruebas

```bash
npm ci
npm test                         # configuración, dashboards, exportador
npm run lint && npm run format:check
sh scripts/probar-imagenes.sh    # necesita Docker; el pipeline la corre en cada PR
```

## Despliegue

Todavía no se despliega nada: el workflow solo corre pruebas en los pull requests. Los servicios de Prometheus y Grafana se crean en Railway aparte (Prometheus sin dominio público) y el despliegue con `banklite-pipelines@v1` se activa en un PR posterior.
