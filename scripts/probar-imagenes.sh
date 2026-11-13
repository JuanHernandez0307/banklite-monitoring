#!/bin/sh
# Construye las dos imágenes y comprueba:
# - Prometheus: la configuración pasa promtool y el servicio arranca sano;
# - Grafana: no arranca sin credenciales propias ni con una contraseña débil;
# - Grafana con credenciales: sin sesión todo da 401 (sin acceso anónimo), con sesión se ven
#   el datasource y los cuatro dashboards, y el registro público está apagado.
# La contraseña de la prueba se genera al azar en cada corrida (no hay ninguna en el repo).
# La corre el pipeline (prueba-extra del workflow); en local necesita Docker.
# Uso: sh scripts/probar-imagenes.sh [prometheus|grafana]   (sin argumento prueba las dos)
set -e

objetivo=${1:-todo}
case "$objetivo" in
  todo | prometheus | grafana) ;;
  *) echo "Uso: sh scripts/probar-imagenes.sh [prometheus|grafana]"; exit 2 ;;
esac
quiere() { [ "$objetivo" = todo ] || [ "$objetivo" = "$1" ]; }

quiere prometheus && docker build -f prometheus/Dockerfile -t banklite-prometheus .
quiere grafana && docker build -f grafana/Dockerfile -t banklite-grafana .

limpiar() { docker rm -f prom-prueba graf-prueba graf-sin-clave graf-clave-debil > /dev/null 2>&1 || true; }
limpiar
trap limpiar EXIT

fallo() { echo "FALLÓ: $1"; exit 1; }

# ---------------------------------------------------------------- Prometheus
if quiere prometheus; then
docker run --rm --entrypoint promtool banklite-prometheus check config /etc/prometheus/prometheus.yml \
  || fallo "promtool rechaza prometheus.yml"

docker run -d --name prom-prueba -p 19090:9090 banklite-prometheus > /dev/null
for i in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:19090/-/healthy)" = 200 ] && break
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:19090/-/healthy)" = 200 ] || fallo "Prometheus no quedó sano"
echo "Prometheus: configuración válida y servicio sano"
fi

# ---------------------------------------------------------------- Grafana
if quiere grafana; then
# no_arranca <nombre> <texto esperado en el log> [opciones de docker run...]
no_arranca() {
  nombre=$1; texto=$2; shift 2
  docker run -d --name "$nombre" "$@" banklite-grafana > /dev/null
  for i in $(seq 1 20); do
    [ "$(docker inspect -f '{{.State.Running}}' "$nombre")" = false ] && break
    sleep 1
  done
  estado=$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$nombre")
  echo "$nombre -> running/exit: $estado"
  case "$estado" in
    true* | "false 0") fallo "$nombre arrancó (o terminó sin error)" ;;
  esac
  docker logs "$nombre" 2>&1 | grep -q "$texto" || fallo "$nombre no explicó el motivo ($texto)"
}

no_arranca graf-sin-clave "GF_SECURITY_ADMIN_PASSWORD"
no_arranca graf-clave-debil "al menos 12 caracteres" -e GF_SECURITY_ADMIN_USER=monitoreo -e GF_SECURITY_ADMIN_PASSWORD=corta
echo "Grafana: sin credenciales propias o con una clave débil no arranca"

usuario=prueba
clave=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
docker run -d --name graf-prueba -p 13000:3000 \
  -e GF_SECURITY_ADMIN_USER="$usuario" -e GF_SECURITY_ADMIN_PASSWORD="$clave" banklite-grafana > /dev/null
for i in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:13000/api/health)" = 200 ] && break
  sleep 1
done
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:13000/api/health)" = 200 ] || {
  docker logs graf-prueba 2>&1 | tail -20
  fallo "Grafana no quedó sano"
}

codigo() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
[ "$(codigo http://localhost:13000/api/search)" = 401 ] || fallo "sin sesión /api/search debería dar 401"
[ "$(codigo http://localhost:13000/api/datasources)" = 401 ] || fallo "sin sesión /api/datasources debería dar 401"
[ "$(codigo -u "$usuario:mala-clave-12345" http://localhost:13000/api/search)" = 401 ] || fallo "una clave incorrecta debería dar 401"
[ "$(codigo -u "$usuario:$clave" http://localhost:13000/api/search)" = 200 ] || fallo "con las credenciales debería dar 200"
echo "Grafana: sin acceso anónimo; con las credenciales entra"

titulos=$(curl -s -u "$usuario:$clave" 'http://localhost:13000/api/search?type=dash-db' | grep -o '"uid":"banklite-[a-z]*"' | sort -u | wc -l)
[ "$titulos" -eq 4 ] || fallo "debería haber 4 dashboards provisionados y hay $titulos"
curl -s -u "$usuario:$clave" http://localhost:13000/api/datasources/uid/prometheus | grep -q '"type":"prometheus"' \
  || fallo "falta el datasource provisionado"
echo "Grafana: datasource y 4 dashboards provisionados"

# El registro público debe estar apagado: crear un usuario sin sesión no puede funcionar.
registro=$(codigo -X POST -H 'Content-Type: application/json' \
  -d '{"name":"x","email":"x@example.com","login":"x","password":"Contrasena-12345"}' http://localhost:13000/api/user/signup)
case "$registro" in
  401 | 403 | 404) ;;
  *) fallo "el registro público debería estar apagado y respondió $registro" ;;
esac
echo "Grafana: registro público apagado"
fi
