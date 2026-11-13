#!/bin/sh
# Arranca Grafana solo con credenciales propias: sin ellas Grafana usaría admin/admin.
# Nunca imprime el valor de la contraseña, solo los nombres de las variables.
set -e

if [ -z "$GF_SECURITY_ADMIN_USER" ] || [ -z "$GF_SECURITY_ADMIN_PASSWORD" ]; then
  echo "Faltan las variables GF_SECURITY_ADMIN_USER y GF_SECURITY_ADMIN_PASSWORD: Grafana no arranca sin credenciales propias." >&2
  exit 1
fi
if [ "${#GF_SECURITY_ADMIN_PASSWORD}" -lt 12 ]; then
  echo "GF_SECURITY_ADMIN_PASSWORD debe tener al menos 12 caracteres." >&2
  exit 1
fi
case "$GF_SECURITY_ADMIN_PASSWORD" in
  admin | password | grafana | changeme)
    echo "GF_SECURITY_ADMIN_PASSWORD es una contraseña de ejemplo: define una propia." >&2
    exit 1
    ;;
esac

# Railway publica el puerto en PORT; sin él (docker-compose) se usa 3000.
export GF_SERVER_HTTP_PORT="${PORT:-3000}"
exec /run.sh "$@"
