# Desplegar ¿Hay Cupo? en Netlify paso a paso

El sitio (una sola app de Next.js) y la revisión de SIIAU corren en Netlify; la base de datos
está en Turso. Todo con planes gratuitos. Los límites de abajo eran los vigentes al escribir
esto: revísalos antes de lanzar.

| Pieza                     | Servicio | Plan gratuito (lo que importa aquí)                                             |
| ------------------------- | -------- | ------------------------------------------------------------------------------- |
| Sitio y revisión de SIIAU | Netlify  | 300 créditos al mes (tope duro); páginas de 10 s; funciones programadas de 30 s |
| Base de datos             | Turso    | 5 GB, 500 M filas leídas y 10 M escritas al mes                                 |
| Correo                    | Resend   | 100 correos al día, 3 000 al mes, 1 dominio                                     |
| Bot                       | Telegram | Gratis                                                                          |
| Notificaciones            | Web Push | Gratis (los servicios de push de los navegadores)                               |
| CI y despliegues          | GitHub   | Gratis en repositorios públicos                                                 |

## Antes de empezar: cuánto alcanza el plan gratuito de Netlify

Netlify cobra el tiempo que corren las funciones (10 créditos por GB-hora; con 1 GB, 1 crédito
son 6 minutos de función) y 15 créditos por cada despliegue a producción. Si se acaban los 300
créditos del mes, **pausa el sitio** hasta el mes siguiente. Cuentas aproximadas (los detalles
están en la [decisión 32](decisions.md)):

| Concepto                                                  | Créditos al mes |
| --------------------------------------------------------- | --------------- |
| La revisión programada, cada minuto, aunque no haya nada  | ~60             |
| Cada materia vigilada cada 5 minutos (1–3 s por revisión) | ~25–70          |
| Cada despliegue a producción                              | 15              |
| Visitas (≈0,5 s por página; 10 000 páginas)               | ~15             |

**En resumen: unas 3 materias vigiladas.** Además, la revisión hace como máximo una materia por
minuto: 5 materias cada 5 minutos, o 2 cada 2 minutos en la semana de registro; con más, cada
una se revisa con menos frecuencia. Para un lanzamiento con muchos estudiantes, usa la opción
[Más capacidad](#más-capacidad-la-revisión-en-tu-vm) (gratis) o un plan de pago de Netlify.

Revisa el consumo en Netlify → **Team settings → Usage & billing**.

Necesitas Node 24, pnpm 10 y el repositorio clonado con `pnpm install` hecho.

## 1. Turso (base de datos)

1. Crea una cuenta en [turso.tech](https://turso.tech) e instala la CLI:

   ```sh
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```

2. Crea la base cerca de las funciones de Netlify (por defecto corren en EE. UU., en `us-east-2`,
   Ohio; la CLI lista las ubicaciones con `turso db locations`):

   ```sh
   turso db create haycupo
   turso db show haycupo --url        # → TURSO_DATABASE_URL (libsql://…)
   turso db tokens create haycupo     # → TURSO_AUTH_TOKEN (es una contraseña)
   ```

3. Aplica las migraciones desde tu máquina (después las aplica el workflow de despliegue):

   ```sh
   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… pnpm --filter @haycupo/db migrate
   ```

4. **Periodos de registro.** Las alertas se apagan solas al terminar el registro del ciclo, y
   durante esos días se revisa cada 2 minutos. La migración trae 2027A (11 al 15 de enero de
   2027, hora de Guadalajara); **confirma las fechas con el calendario oficial de la UdeG** y
   agrega cada ciclo nuevo con `turso db shell haycupo` (las fechas van en milisegundos):

   ```sql
   INSERT INTO registration_windows (cycle, label, starts_at, ends_at) VALUES
     ('202720', 'Registro de materias 2027B',
      unixepoch('2027-07-12T00:00:00-06:00') * 1000,
      unixepoch('2027-07-17T00:00:00-06:00') * 1000)
   ON CONFLICT (cycle) DO UPDATE
     SET label = excluded.label, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
   ```

## 2. Resend (correo)

1. Crea una cuenta en [resend.com](https://resend.com).
2. **Domains → Add domain** y agrega en tu DNS los registros que te pide (SPF, DKIM). Sin
   dominio verificado, Resend solo entrega a tu propio correo: sirve para probar, no para lanzar.
3. **API Keys → Create** con permiso _Sending access_. Es `RESEND_API_KEY`.
4. `EMAIL_FROM` será algo como `¿Hay Cupo? <avisos@tudominio.com>`.

## 3. El sitio en Netlify

1. Crea una cuenta en [netlify.com](https://www.netlify.com). Desde la raíz del repositorio
   (`pnpm netlify` corre la CLI de Netlify, con la versión fijada en `package.json`):

   ```sh
   pnpm netlify login
   pnpm netlify sites:create --name haycupo     # → https://haycupo.netlify.app
   ```

   Si el nombre ya está ocupado, elige otro y úsalo en lugar de `haycupo` en los comandos de
   abajo. Anota el **Site ID** que imprime (también está en Site configuration → General).

2. **No conectes el repositorio de GitHub al sitio.** Si lo conectas, Netlify construye y
   publica en cada push, y cada publicación cuesta 15 créditos. Los despliegues los hace el
   workflow `Deploy` cuando tú decides (paso 5).

3. **Variables de entorno** (Site configuration → Environment variables, o
   `pnpm netlify env:set NOMBRE valor --site haycupo`). Indispensables:

   | Variable              | Valor                                                     |
   | --------------------- | --------------------------------------------------------- |
   | `TURSO_DATABASE_URL`  | `libsql://haycupo-<tu-organización>.turso.io`             |
   | `TURSO_AUTH_TOKEN`    | El token de Turso                                         |
   | `APP_URL`             | `https://haycupo.netlify.app` (o tu dominio)              |
   | `APP_SECRET`          | `openssl rand -hex 32`                                    |
   | `INTERNAL_API_TOKEN`  | `openssl rand -hex 32` (otro distinto)                    |
   | `SIIAU_CONTACT_EMAIL` | Público: SIIAU lo ve y la página de privacidad lo muestra |
   | `EMAIL_TRANSPORT`     | `resend`                                                  |
   | `RESEND_API_KEY`      | La de Resend                                              |
   | `EMAIL_FROM`          | `¿Hay Cupo? <avisos@tudominio.com>`                       |

   Opcionales: Telegram ([docs/telegram.md](telegram.md)) y `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY` (`pnpm --filter @haycupo/notify vapid`; si cambian después, las
   suscripciones existentes dejan de servir). **No** pongas `SIIAU_ORIGIN_OVERRIDE`: con un
   valor, la app consultaría al SIIAU falso.

   En Netlify, la app se ajusta sola: espera menos a SIIAU para caber en los 10 s de una página
   (2,5 s de turno y 5,5 s de respuesta) y revisa una materia por corrida. Se pueden cambiar con
   `SIIAU_MAX_WAIT_MS`, `SIIAU_TIMEOUT_MS` (su suma debe quedar debajo de unos 9 s) y
   `POLL_MAX_SUBJECTS_PER_RUN`; no copies los valores de `.env.example`.

   Las variables se leen al desplegar: **después de cambiar una, vuelve a desplegar**.

   Netlify detiene el despliegue si el valor de una variable marcada como secreta aparece en
   el código. Los ajustes que no son secretos (`EMAIL_TRANSPORT`, `SIIAU_MIN_DELAY_MS`…) ya
   están excluidos de esa revisión en `SECRETS_SCAN_OMIT_KEYS`, dentro de
   `apps/web/netlify.toml`; ese valor manda sobre el del panel. Si agregas otro ajuste que no
   sea secreto, súmalo ahí.

4. **Primer despliegue,** desde tu máquina (construye en tu computadora y sube el resultado):

   ```sh
   pnpm netlify deploy --prod --filter @haycupo/web --site haycupo
   ```

   Netlify toma la función programada de `apps/web/netlify.toml` (cada minuto) y la ves en
   **Logs & metrics → Functions → poll**.

5. **Dominio propio (opcional):** Domain management → Add a domain. Netlify da el certificado
   HTTPS. Actualiza `APP_URL` y vuelve a desplegar.

## 4. Revisión después de desplegar

1. Abre `/estado`: en un par de minutos debe decir "Todo funciona" (la revisión programada
   corre cada minuto; sus registros están en Functions → poll).
2. **Antes de anunciar el sitio,** busca una materia real del ciclo actual y compárala con
   SIIAU. Es la primera vez que el parser ve páginas reales (el entorno de desarrollo no podía
   llegar a SIIAU); si algo no cuadra, revisa los registros de la función del servidor en
   Netlify y la tabla de peticiones en `/estado`.
3. Crea una alerta con tu correo y revisa en `/estado` que la materia aparezca vigilada.
4. Prueba el freno de emergencia (funciona al instante, sin volver a desplegar):

   ```sh
   curl -X POST "https://haycupo.netlify.app/api/internal/brake" \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"action":"pause","minutes":5,"reason":"prueba"}'
   ```

   `/estado` debe mostrar "En pausa". Para reanudar: `-d '{"action":"resume"}'`.

## 5. Despliegues desde GitHub Actions

El workflow `Deploy` revisa el código (lint, tipos, pruebas), aplica las migraciones en Turso y
publica en Netlify. Corre **a mano** (Actions → Deploy → Run workflow) o **al subir una
etiqueta** de versión, nunca en cada push:

```sh
git tag v1.0.0 && git push origin v1.0.0
```

Para activarlo, en el repositorio, **Settings → Secrets and variables → Actions**:

- **Secrets:**
  - `NETLIFY_AUTH_TOKEN`: en Netlify, User settings → Applications → Personal access tokens.
  - `NETLIFY_SITE_ID`: el Site ID del paso 3.
  - `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`: para aplicar las migraciones.
- **Variables:** `DEPLOY_ENABLED` = `true` y `SITE_URL` = `https://haycupo.netlify.app` (para
  revisar `/api/health` al terminar).

## Operar durante la semana de registro

- **Frenar todo** al instante: el `curl` del freno (hasta 7 días). Para apagar las consultas
  del todo: `SIIAU_ENABLED=false` en Netlify y volver a desplegar.
- **Créditos:** revisa el consumo cada día. Para revisar más seguido, puedes subir
  `POLL_MAX_SUBJECTS_PER_RUN` a 2 o 3 (cada materia extra en una corrida espera la pausa de 3 s,
  y esa espera se cobra), o mover la revisión a la VM (abajo).
- **Correo:** el plan gratuito de Resend permite 100 al día; la app se detiene en 90 (los
  enlaces para entrar cuentan). `/estado` muestra cuántos van. Si se acaba, Telegram y las
  notificaciones siguen funcionando.
- Nunca bajes `SIIAU_MIN_DELAY_MS` de 2 s ni los intervalos de 2 minutos: la app no arranca con
  valores menores.

## Más capacidad: la revisión en tu VM

En una VM la espera entre peticiones no cuesta nada, así que puede revisar todas las materias
que haga falta. El sitio se queda en Netlify y ambos comparten la base Turso:

1. En Netlify, pon `SCHEDULER_ENABLED=false` y vuelve a desplegar: la función programada sigue
   llamándose cada minuto, pero termina al instante sin consultar SIIAU.
2. En la VM (por ejemplo Oracle Cloud Always Free, con Ubuntu), instala Docker y Git:

   ```sh
   sudo apt update && sudo apt install -y git
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER     # sal y vuelve a entrar por SSH
   ```

   Si la VM tiene 1 GB de memoria, agrega 2 GB de swap: compilar Next.js necesita más.

3. Baja el código y crea `~/haycupo/.env` con **las mismas** variables que en Netlify, más
   `SCHEDULER_ENABLED=true`, `POLL_MAX_SUBJECTS_PER_RUN=15`, `SIIAU_ORIGIN_OVERRIDE=` (vacío) y
   `SITE_DOMAIN` con tu dominio de Netlify (aquí no se usa, pero `compose.yaml` lo exige):

   ```sh
   git clone https://github.com/marvin7460/SiiauAlarma.git ~/haycupo && cd ~/haycupo
   cp .env.example .env && chmod 600 .env && nano .env
   ```

4. Arranca solo la app; no necesita puertos abiertos ni Caddy, porque nadie la visita:

   ```sh
   docker compose up -d --build app
   docker compose logs -f app        # "Scheduler started: polling SIIAU every minute."
   ```

   Para actualizarla: `git pull && docker compose up -d --build app`.

Si algún día quieres todo en la VM (sitio incluido), `compose.yaml` también levanta Caddy con
HTTPS automático: pon `SITE_DOMAIN` en el `.env`, abre los puertos 80 y 443 y corre
`docker compose up -d --build`.

## Desarrollo local (sin cuentas)

No necesitas Netlify ni Turso para desarrollar: con `TURSO_DATABASE_URL=file:../../data/local.db`
(el valor de `.env.example`) la app usa un archivo SQLite en `data/` y revisa SIIAU con su
propio temporizador. Ver el README. Para probar la build de Netlify sin cuenta:

```sh
pnpm netlify build --offline --filter @haycupo/web
pnpm --filter @haycupo/web check:netlify     # carga la función programada empaquetada
```
