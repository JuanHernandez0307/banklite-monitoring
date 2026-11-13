# banklite-monitoring

Prometheus y Grafana de BankLite: la configuración, los dashboards como archivos y las imágenes de los dos servicios. Es una herramienta de monitoreo académico; los datos son ficticios.

```
servicios (14)  ──/metrics, puerto 9100, red privada──►  Prometheus  ──►  Grafana (login)
```

## Qué hay aquí

| Ruta                                                  | Qué es                                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prometheus/prometheus.yml`                           | Configuración para Railway: los 14 servicios por `<servicio>.railway.internal:9100`, cada 30 s. Generado.                                                                          |
| `prometheus/prometheus.local.yml`                     | La misma, apuntando al exportador de demostración (docker-compose). Generado.                                                                                                      |
| `prometheus/Dockerfile`, `railway.json`               | Imagen de Prometheus: guarda 7 días o 2 GB, datos en `/prometheus` (volumen).                                                                                                      |
| `grafana/Dockerfile`, `entrypoint.sh`, `railway.json` | Imagen de Grafana: sin acceso anónimo ni registro público; **no arranca sin usuario y contraseña propios**.                                                                        |
| `grafana/provisioning/`                               | Datasource y proveedor de dashboards como archivos.                                                                                                                                |
| `grafana/dashboards/`                                 | Los cuatro dashboards (JSON generado): salud, tráfico y errores, latencia p95, negocio (transferencias con sus rechazos por motivo, alertas de fraude, pagos y cierres de cuenta). |
| `scripts/`                                            | Generador, pruebas (`node --test`) y `probar-imagenes.sh` (la corre el pipeline).                                                                                                  |
| `demo/exportador.mjs`                                 | Métricas **ficticias** con los mismos nombres que las reales, para ver los dashboards sin Railway.                                                                                 |
| `docker-compose.yml`                                  | Respaldo local: Prometheus + Grafana + exportador de demostración.                                                                                                                 |

Los archivos «Generado» salen de `scripts/` (`npm run generar`); una prueba comprueba que lo versionado coincide con el generador. Para cambiar un dashboard o la lista de servicios se edita el generador, no el JSON.

## Métricas que esperan los dashboards

Cada servicio publica `/metrics` en el puerto `9100` (solo red privada). Prometheus agrega la etiqueta `service`.

| Métrica                                            | Etiquetas                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `http_requests_total`                              | `route` (plantilla, sin ids), `method`, `status`                                     |
| `http_request_duration_seconds` (histograma)       | `route`, `method`                                                                    |
| `process_*` y `nodejs_*` (prom-client)             | —                                                                                    |
| `transfers_total` (transfer-service)               | `result`: `completed`, `rejected`; `reason`: `none` o uno de 13 motivos de rechazo   |
| `fraud_alerts_total` (fraud-service)               | `level`: `medium`, `high`; `decision`: `review` (generada), `confirmed`, `dismissed` |
| `payment_gateway_payments_total` (deposit-service) | `result`: `approved`, `declined`, `voided`, `error`                                  |
| `account_closures_total` (account-service)         | `result`: `completed`, `requirements`, `error`                                       |

Detalles que importan al leer los paneles:

- **Rechazos de transferencias:** `reason` solo tiene valor distinto de `none` cuando `result="rejected"`; los 13
  motivos están explicados en el glosario del dashboard de negocio. No cuentan los fallos de infraestructura (5xx).
- **Alertas de fraude:** cada alerta cuenta una vez como `review` al generarse y otra como `confirmed` o `dismissed`
  cuando el personal la resuelve. «Alertas generadas» = `decision="review"`; sumar sin filtrar mezclaría el ciclo
  completo, por eso todas las consultas de fraude filtran por `decision`.
- **Pagos:** `approved` = la pasarela aprobó y se abonó; sin nombres de proveedores en métricas ni etiquetas.
- **Cierres de cuenta:** `completed` cuenta una vez por cliente; `requirements` = quedó algo pendiente.

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
sh scripts/probar-imagenes.sh    # necesita Docker (opcional: prometheus | grafana); el pipeline la corre en cada PR
```

## Despliegue

Todavía no se despliega nada: el workflow solo corre pruebas en los pull requests.

- `.github/workflows/servicio.yml` es una **copia local** del pipeline compartido `banklite-pipelines` (etiqueta `v1.1`): ese repositorio es privado y de otro dueño, y GitHub no deja llamarlo desde este. `deploy.yml` la llama con `uses: ./.github/workflows/servicio.yml`, una vez por servicio (`prometheus` y `grafana`). La copia agrega las entradas opcionales `dockerfile` y `contexto` y nombra la imagen de GHCR con el servicio. Los cambios que se hagan al original hay que copiarlos aquí a mano.
- Los servicios de Prometheus y Grafana se crean en Railway aparte (Prometheus sin dominio público). Cada uno usa su `railway.json` (`prometheus/railway.json`, `grafana/railway.json`) como archivo de configuración del servicio.
- El despliegue se activa en un PR posterior, cuando existan los servicios y el secret `RAILWAY_TOKEN` de este repositorio.
