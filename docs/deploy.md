# Desplegar ¿Hay Cupo? paso a paso

Todo con planes gratuitos. Los límites de abajo eran los vigentes al escribir esto; revisa las
páginas de precios de cada servicio antes de lanzar.

| Pieza                | Servicio           | Plan gratuito (lo que importa aquí)                           |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| Base de datos        | Supabase           | 500 MB; se pausa tras 7 días sin actividad (el cron lo evita) |
| Worker (SIIAU, cron) | Cloudflare Workers | 100 000 peticiones al día, 10 ms de CPU por invocación        |
| Sitio web            | Vercel (Hobby)     | Uso personal y sin fines comerciales                          |
| Correo               | Resend             | 100 correos al día, 3 000 al mes, 1 dominio                   |
| Bot                  | Telegram           | Gratis                                                        |
| Notificaciones       | Web Push           | Gratis (los servicios de push de los navegadores)             |
| CI y despliegues     | GitHub Actions     | Gratis en repositorios públicos                               |

Cuentas de consumo: con 50 materias vigiladas, el worker hace unas 1 440 invocaciones de cron
más ~14 400 de sondeo al día (una por materia cada 5 minutos). Muy por debajo de 100 000.

Necesitas Node 24 (ver `.nvmrc`), pnpm 10 y el repositorio clonado con `pnpm install` hecho.

## 1. Supabase (base de datos)

1. Crea un proyecto en [supabase.com](https://supabase.com). Región: la más cercana a México
   que ofrezca (por ejemplo, _East US_ o _West US_). Guarda la contraseña de la base.
2. En **Connect** copia dos cadenas de conexión:
   - **Transaction pooler** (puerto `6543`): será `DATABASE_URL` del worker y de la web.
   - **Session pooler** (puerto `5432`): será `MIGRATION_DATABASE_URL`. No uses la "Direct
     connection": solo funciona por IPv6, y los runners de GitHub Actions no tienen IPv6.
3. Apaga la Data API, que la app no usa: **Project Settings → Data API → Enable Data API**
   desactivado. (Todas las tablas tienen además Row Level Security sin políticas; ver la
   [decisión 26](decisions.md).)
4. Aplica las migraciones desde tu máquina:

   ```sh
   MIGRATION_DATABASE_URL='postgres://…:5432/postgres' pnpm --filter @haycupo/db migrate
   ```

5. **Periodos de registro.** Las alertas se apagan solas al terminar el registro del ciclo, y
   durante esos días se revisa cada 2 minutos. La migración trae 2027A (11 al 15 de enero de
   2027, hora de Guadalajara); **confirma las fechas con el calendario oficial de la UdeG** y
   agrega cada ciclo nuevo en el SQL Editor de Supabase:

   ```sql
   INSERT INTO registration_windows (cycle, label, starts_at, ends_at) VALUES
     ('202720', 'Registro 2027B', '2027-07-12 00:00-06', '2027-07-17 00:00-06')
   ON CONFLICT (cycle) DO UPDATE
     SET label = excluded.label, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
   ```

## 2. Resend (correo)

1. Crea una cuenta en [resend.com](https://resend.com).
2. **Domains → Add domain** y agrega en tu DNS los registros que te pide (SPF, DKIM). Sin
   dominio verificado, Resend solo entrega a tu propio correo: sirve para probar, no para lanzar.
3. **API Keys → Create** con permiso _Sending access_. Es `RESEND_API_KEY`.
4. `EMAIL_FROM` será algo como `¿Hay Cupo? <avisos@tudominio.com>`.

## 3. Secretos compartidos

Genera dos valores largos y aleatorios (cada uno se usa igual en el worker y en la web):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # INTERNAL_API_TOKEN
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # APP_SECRET
```

Opcional, para notificaciones del navegador: `pnpm --filter @haycupo/notify vapid` imprime
`VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`. Guárdalas: si cambian, todas las suscripciones
existentes dejan de funcionar.

## 4. Cloudflare Workers (el worker)

1. Crea una cuenta en [cloudflare.com](https://dash.cloudflare.com) y elige tu subdominio
   `*.workers.dev` (Workers & Pages → primera visita).
2. Desde `apps/worker`:

   ```sh
   pnpm wrangler login
   pnpm wrangler deploy            # la primera vez crea el Worker "haycupo-worker"
   ```

3. Guarda los secretos (cada comando pide el valor):

   ```sh
   pnpm wrangler secret put DATABASE_URL          # transaction pooler, puerto 6543
   pnpm wrangler secret put INTERNAL_API_TOKEN
   pnpm wrangler secret put APP_SECRET
   pnpm wrangler secret put APP_URL               # https://tu-sitio.vercel.app (paso 5)
   pnpm wrangler secret put SIIAU_CONTACT_EMAIL   # público: SIIAU lo ve en el User-Agent
   pnpm wrangler secret put RESEND_API_KEY
   pnpm wrangler secret put EMAIL_FROM
   # Opcionales:
   pnpm wrangler secret put TELEGRAM_BOT_TOKEN
   pnpm wrangler secret put TELEGRAM_WEBHOOK_SECRET
   pnpm wrangler secret put VAPID_PUBLIC_KEY
   pnpm wrangler secret put VAPID_PRIVATE_KEY
   ```

   Los valores no secretos (intervalos, `POLL_MODE=fanout`, etc.) están en `wrangler.jsonc`.

4. Comprueba: `curl https://haycupo-worker.<tu-subdominio>.workers.dev/health` debe responder
   `{"ok":true,…}`.
5. **Antes de anunciar el sitio, verifica dos cosas en producción** (no se pudieron probar
   desde el entorno de desarrollo):
   - Que SIIAU responde desde Cloudflare: despliega `tools/cf-probe` (ver su README) y revisa
     que `robots.txt` y una consulta devuelvan 200.
   - El tiempo de CPU real: en el panel del Worker → **Metrics → CPU time**, el percentil 99
     debe quedar por debajo de 10 ms. Si no, mira la [decisión 19](decisions.md).

## 5. Vercel (sitio web)

1. En [vercel.com](https://vercel.com), **Add New → Project** e importa el repositorio.
2. **Root Directory:** `apps/web`. Framework: Next.js (lo detecta solo).
3. **Environment Variables** (Production):

   | Variable                | Valor                                                |
   | ----------------------- | ---------------------------------------------------- |
   | `DATABASE_URL`          | Transaction pooler (6543)                            |
   | `WORKER_URL`            | `https://haycupo-worker.<tu-subdominio>.workers.dev` |
   | `INTERNAL_API_TOKEN`    | El mismo del worker                                  |
   | `APP_SECRET`            | El mismo del worker                                  |
   | `APP_URL`               | La URL pública del sitio                             |
   | `EMAIL_TRANSPORT`       | `resend`                                             |
   | `RESEND_API_KEY`        | La misma del worker                                  |
   | `EMAIL_FROM`            | El mismo del worker                                  |
   | `SIIAU_CONTACT_EMAIL`   | El mismo (se muestra en Privacidad y Acerca de)      |
   | `TELEGRAM_BOT_USERNAME` | Opcional: el usuario del bot, sin @                  |
   | `VAPID_PUBLIC_KEY`      | Opcional: solo la pública                            |

4. El primer despliegue lo hace el asistente de Vercel. Los siguientes los hace GitHub Actions
   (paso 7): `apps/web/vercel.json` apaga los despliegues automáticos por Git para que la web
   nunca llegue antes que su migración.
5. Si usas dominio propio, agrégalo en **Settings → Domains** y actualiza `APP_URL` en Vercel
   y en el worker (`wrangler secret put APP_URL`).

## 6. Telegram (opcional)

Sigue [docs/telegram.md](telegram.md). Necesita el worker ya desplegado.

## 7. GitHub Actions (despliegues automáticos)

En el repositorio, **Settings → Secrets and variables → Actions**:

- **Secrets:**
  - `MIGRATION_DATABASE_URL`: session pooler (5432).
  - `CLOUDFLARE_API_TOKEN`: en Cloudflare, **My Profile → API Tokens → Create Token →
    Edit Cloudflare Workers**.
  - `CLOUDFLARE_ACCOUNT_ID`: en el panel de Workers, columna derecha.
  - `VERCEL_TOKEN`: en Vercel, **Account Settings → Tokens**.
  - `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID`: corre `pnpm dlx vercel@62 link` dentro de `apps/web`
    y cópialos de `apps/web/.vercel/project.json` (esa carpeta no se sube).
- **Variables:**
  - `DEPLOY_ENABLED` = `true`.
  - `WORKER_URL` = la URL del worker (para la revisión de `/health` después de desplegar).

Opcional: en **Settings → Environments → production** puedes pedir aprobación manual antes
de cada despliegue.

Desde entonces, cada _push_ a `main` corre CI y, si pasa, `Deploy`: migraciones → worker →
web. También puedes lanzarlo a mano en **Actions → Deploy → Run workflow**.

## 8. Revisión después de desplegar

1. Abre `/estado`: debe decir "Todo funciona" (la primera revisión programada corre en menos
   de un minuto).
2. Busca una materia real del ciclo actual y compara con SIIAU.
3. Crea una alerta con tu correo y revisa en `/estado` que la materia aparezca vigilada.
4. Prueba el freno de emergencia:

   ```sh
   curl -X POST "$WORKER_URL/internal/brake" \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"action":"pause","minutes":5,"reason":"prueba"}'
   ```

   `/estado` debe mostrar "En pausa". Para reanudar: `-d '{"action":"resume"}'`.

## Operar durante la semana de registro

- **Frenar todo** al instante: el `curl` de arriba (hasta 7 días). Para apagarlo del todo,
  cambia `SIIAU_ENABLED` a `"false"` en `wrangler.jsonc` y despliega.
- **Si SIIAU va lento**, sube `SIIAU_MIN_DELAY_MS` o `POLL_REGISTRATION_INTERVAL_SECONDS` en
  `wrangler.jsonc`. Nunca por debajo de los mínimos (2 s y 2 minutos): la configuración los
  rechaza.
- **Correo:** el plan gratuito de Resend permite 100 al día; la app se detiene en 90 (los
  enlaces para entrar cuentan). `/estado` muestra cuántos van. Si se acaba, Telegram y las
  notificaciones siguen funcionando.
- **Registros:** `pnpm wrangler tail` (desde `apps/worker`) muestra en vivo lo que hace el
  worker.

## Plan B: el worker en una máquina con Node

Si Cloudflare no funciona (por ejemplo, si SIIAU bloquea sus IPs o el CPU no alcanza), el mismo
worker corre como servidor Node en cualquier VM pequeña:

```sh
pnpm install --frozen-lockfile
pnpm --filter @haycupo/worker start   # lee .env.local; sondea cada minuto
```

Pon `WORKER_URL` de la web apuntando a esa máquina (con HTTPS, por ejemplo detrás de Caddy).
