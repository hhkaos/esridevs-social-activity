# RSS Feed Server

Servidor Node.js ligero que expone un feed RSS 2.0 del contenido de Esri Developers, con soporte de filtros personalizados y caché en memoria para no saturar la fuente de datos.

## Requisitos

- Node.js 18 o superior
- npm

Comprueba la versión instalada:

```bash
node --version
```

---

## Instalación

```bash
cd rss-server
npm install
cp .env.example .env
```

Edita `.env` con los valores de tu entorno (mínimo obligatorio: `RSS_SERVER_URL`).

---

## Variables de entorno

| Variable | Por defecto | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto TCP en el que escucha el servidor |
| `CACHE_TTL_MS` | `600000` | Tiempo de vida de la caché en memoria (ms). 600 000 = 10 min |
| `FEED_BASE_URL` | URL del sitio web | URL que aparece en el elemento `<link>` del canal RSS |
| `RSS_SERVER_URL` | `http://localhost:3001` | URL pública de **este servidor**. Se usa en el `atom:link` de autodescripción del feed. Debe ser accesible desde los clientes RSS |
| `MAX_ITEMS` | `100` | Número máximo de entradas por respuesta |

---

## Uso

### Arranque manual (pruebas)

```bash
node server.js
```

### Feed sin filtros

```
http://tu-servidor:3001/feed.xml
```

### Feed filtrado

Copia el share link de la web app (`?state=…`) y cambia el dominio base:

```
# Share link de la web app:
https://esri.github.io/esridevs-social-activity/?state=N4IgJg9g...

# Mismo estado como feed RSS:
http://tu-servidor:3001/feed.xml?state=N4IgJg9g...
```

El parámetro `state` usa el mismo formato LZString que el share link de la web app: cualquier filtro que configures y compartas en la web funciona directamente como feed RSS.

### Health check

```bash
curl http://tu-servidor:3001/health
# → OK
```

---

## Mantener el servidor siempre activo

Se recomienda usar **PM2**, un gestor de procesos para Node.js que:

- Reinicia el proceso si se cae.
- Arranca automáticamente tras reiniciar la máquina.
- Guarda los logs en archivos con rotación automática.

### Instalar PM2

```bash
npm install -g pm2
```

### Arrancar el servidor con PM2

```bash
cd rss-server
pm2 start server.js --name rss-feed
```

### Arranque automático al reiniciar la máquina

```bash
# Genera e instala el script de inicio para tu sistema (systemd, launchd, etc.)
pm2 startup
# El comando imprimirá una línea que debes ejecutar como root/sudo. Ejecútala.

# Guarda el estado actual de procesos PM2 para que se restauren al reiniciar
pm2 save
```

Desde ese momento el servidor arrancará solo cuando la máquina se encienda, sin intervención manual.

### Comandos útiles de PM2

```bash
pm2 list                   # Ver estado de todos los procesos
pm2 show rss-feed          # Ver detalles del proceso (uptime, restarts, memoria)
pm2 restart rss-feed       # Reiniciar (ej. tras cambiar .env)
pm2 stop rss-feed          # Detener
pm2 delete rss-feed        # Eliminar de PM2
```

---

## Logs

### Ver logs en tiempo real

```bash
pm2 logs rss-feed          # stdout + stderr
pm2 logs rss-feed --err    # solo errores
```

### Ver los últimos 100 registros

```bash
pm2 logs rss-feed --lines 100
```

### Dónde se guardan los archivos de log

Por defecto PM2 guarda los logs en:

```
~/.pm2/logs/rss-feed-out.log   # salida estándar (INFO/WARN)
~/.pm2/logs/rss-feed-error.log # errores (ERROR + stack traces)
```

### Rotación automática de logs

Sin rotación, los archivos de log crecen indefinidamente. Instala el módulo oficial de PM2:

```bash
pm2 install pm2-logrotate
```

Configuración recomendada:

```bash
pm2 set pm2-logrotate:max_size 10M    # rotar cuando el archivo supere 10 MB
pm2 set pm2-logrotate:retain 7        # conservar los últimos 7 archivos
pm2 set pm2-logrotate:compress true   # comprimir archivos rotados
```

### Formato de los logs

Cada línea tiene el formato:

```
[LEVEL] 2026-04-08T16:27:59.496Z mensaje
```

Los niveles son `INFO`, `WARN` y `ERROR`. Los errores incluyen siempre el stack trace completo para facilitar el diagnóstico.

Ejemplo de log normal:

```
[INFO ] 2026-04-08T16:27:59.496Z RSS server started — http://localhost:3001/feed.xml
[INFO ] 2026-04-08T16:27:59.498Z Cache TTL: 600s | Max items: 100
[INFO ] 2026-04-08T16:28:01.340Z Fetching sheet data from opensheet…
[INFO ] 2026-04-08T16:28:02.180Z Sheet fetch complete (840ms, 1747 raw rows)
[INFO ] 2026-04-08T16:28:02.185Z Cache refreshed — 798 rows stored (TTL 600s)
[INFO ] 2026-04-08T16:28:02.200Z Served 100/798 items — state:yes ip:::1
```

Ejemplo de error con stack trace:

```
[ERROR] 2026-04-08T16:35:12.000Z Fetch failed: 503 Service Unavailable — https://opensheet.elk.sh/...
Error: Fetch failed: 503 Service Unavailable
    at fetchJson (file:///home/user/rss-server/server.js:58:9)
    at loadSheetRows (file:///home/user/rss-server/server.js:64:3)
    ...
```

---

## Alternativa: systemd (sin PM2)

Si prefieres no instalar PM2 y el servidor usa systemd (la mayoría de distribuciones Linux modernas), puedes crear un servicio directamente.

### Crear el archivo de servicio

Crea el archivo `/etc/systemd/system/rss-feed.service` con el siguiente contenido (ajusta las rutas y el usuario):

```ini
[Unit]
Description=Esri Devs RSS Feed Server
After=network.target

[Service]
Type=simple
User=tu-usuario
WorkingDirectory=/ruta/completa/a/rss-server
EnvironmentFile=/ruta/completa/a/rss-server/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Activar y arrancar el servicio

```bash
sudo systemctl daemon-reload
sudo systemctl enable rss-feed     # arrancar automáticamente al iniciar
sudo systemctl start rss-feed      # arrancar ahora
sudo systemctl status rss-feed     # ver estado
```

### Ver logs con journalctl

```bash
sudo journalctl -u rss-feed -f          # en tiempo real
sudo journalctl -u rss-feed -n 100      # últimas 100 líneas
sudo journalctl -u rss-feed --since today
sudo journalctl -u rss-feed -p err      # solo errores
```

---

## Seguridad y aislamiento con Docker

Aunque el servidor no ejecuta nada del input del usuario (solo descomprime y parsea el parámetro `state`), al ser código open source expuesto a internet es buena práctica ejecutarlo en un contenedor. Docker limita el daño potencial de cualquier vulnerabilidad desconocida:

- El proceso corre como usuario sin privilegios (`node`, uid 1000), no como root.
- El contenedor no tiene acceso al sistema de archivos del host.
- El contenedor solo puede hacer conexiones de red salientes (hacia opensheet) y recibir conexiones en el puerto mapeado.
- Si el proceso es comprometido, el atacante queda dentro del contenedor, aislado del resto de la máquina.

### Construir la imagen

```bash
cd rss-server
docker build -t esridevs-rss-feed .
```

### Arrancar el contenedor

```bash
docker run -d \
  --name rss-feed \
  --restart unless-stopped \
  -p 3001:3001 \
  -e RSS_SERVER_URL=http://tu-servidor:3001 \
  -e CACHE_TTL_MS=600000 \
  -e MAX_ITEMS=100 \
  esridevs-rss-feed
```

`--restart unless-stopped` hace que Docker reinicie el contenedor automáticamente si se cae o si la máquina se reinicia, sin necesidad de PM2 ni systemd.

### Ver logs

```bash
docker logs rss-feed -f          # en tiempo real
docker logs rss-feed --tail 100  # últimas 100 líneas
```

### Parar / reiniciar

```bash
docker stop rss-feed
docker start rss-feed
docker restart rss-feed          # tras cambiar variables de entorno
```

### Actualizar a una nueva versión

```bash
docker stop rss-feed
docker rm rss-feed
docker build -t esridevs-rss-feed .
docker run -d --name rss-feed --restart unless-stopped \
  -p 3001:3001 \
  -e RSS_SERVER_URL=http://tu-servidor:3001 \
  esridevs-rss-feed
```

### Usar un archivo .env con Docker

En lugar de pasar cada variable con `-e`, puedes usar el archivo `.env`:

```bash
docker run -d \
  --name rss-feed \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file .env \
  esridevs-rss-feed
```

> **Nota:** El archivo `.env` no se copia dentro de la imagen (está en `.dockerignore`). Solo se usa en tiempo de ejecución como argumentos al proceso.

---

## Consideraciones de seguridad adicionales

Independientemente de usar Docker o no:

- **No expongas el puerto directamente a internet.** Pon un proxy inverso delante (nginx, Caddy) que gestione TLS. Los lectores RSS modernos requieren HTTPS.
- **Firewall.** Restringe el acceso al puerto 3001 desde la máquina host o la red local; deja que solo el proxy inverso lo use.
- **El servidor no tiene autenticación.** Cualquiera que conozca la URL puede pedir el feed. Si quieres limitarlo, añade autenticación en el proxy inverso (HTTP Basic Auth o similar).
- **El parámetro `state` se deserializa con LZString + JSON.parse**, no se evalúa. No hay riesgo de ejecución de código desde ese vector.

---

## Diagnóstico rápido

| Síntoma | Qué hacer |
|---|---|
| El feed devuelve 503 | `pm2 logs rss-feed --err` para ver si falló la conexión con opensheet |
| El servidor no arranca | Comprobar que el puerto no esté ocupado: `lsof -i :3001` |
| Los datos parecen desactualizados | Normal si está dentro del TTL. Forzar refresco: `pm2 restart rss-feed` |
| PM2 reinicia el proceso en bucle | El proceso está fallando al arrancar: `pm2 logs rss-feed --lines 50` para ver el error |
| El servidor no arranca tras reinicio | Verificar que se ejecutó `pm2 startup` y `pm2 save` |
