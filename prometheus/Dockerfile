# Prometheus de BankLite. Contexto de build: raíz del repo.
# Solo se alcanza por la red privada de Railway (este servicio NO lleva dominio público).
# Los datos van en /prometheus: en Railway se monta ahí el volumen del servicio.
FROM prom/prometheus:v3.5.0
COPY prometheus/prometheus.yml /etc/prometheus/prometheus.yml
COPY prometheus/alertas.yml /etc/prometheus/alertas.yml
EXPOSE 9090
# Se guardan 7 días y, como tope, 2 GB (lo que ocurra primero) para no llenar el volumen.
CMD ["--config.file=/etc/prometheus/prometheus.yml", \
     "--storage.tsdb.path=/prometheus", \
     "--storage.tsdb.retention.time=7d", \
     "--storage.tsdb.retention.size=2GB", \
     "--web.listen-address=:9090"]
