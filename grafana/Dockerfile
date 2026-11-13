# Grafana de BankLite. Contexto de build: raíz del repo.
# Sin acceso anónimo y sin registro público. El usuario y la contraseña NO están en la imagen:
# vienen de las variables GF_SECURITY_ADMIN_USER y GF_SECURITY_ADMIN_PASSWORD del servicio
# (grafana/entrypoint.sh no arranca sin ellas). Los datos van en /var/lib/grafana (volumen).
FROM grafana/grafana-oss:11.6.0
ENV GF_AUTH_ANONYMOUS_ENABLED=false \
    GF_AUTH_DISABLE_LOGIN_FORM=false \
    GF_USERS_ALLOW_SIGN_UP=false \
    GF_USERS_ALLOW_ORG_CREATE=false \
    GF_PUBLIC_DASHBOARDS_ENABLED=false \
    GF_SNAPSHOTS_EXTERNAL_ENABLED=false \
    GF_SECURITY_DISABLE_GRAVATAR=true \
    GF_ANALYTICS_REPORTING_ENABLED=false \
    GF_ANALYTICS_CHECK_FOR_UPDATES=false \
    GF_ANALYTICS_CHECK_FOR_PLUGIN_UPDATES=false \
    GF_NEWS_NEWS_FEED_ENABLED=false \
    GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/banklite-dashboards/salud.json \
    PROMETHEUS_URL=http://prometheus.railway.internal:9090
COPY grafana/provisioning /etc/grafana/provisioning
# Fuera de /var/lib/grafana: el volumen montado ahí no tapa los dashboards de la imagen.
COPY grafana/dashboards /var/lib/banklite-dashboards
COPY --chmod=0755 grafana/entrypoint.sh /usr/local/bin/banklite-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/banklite-entrypoint.sh"]
