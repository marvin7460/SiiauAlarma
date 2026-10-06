# Desplegar ¿Hay Cupo? paso a paso

Una sola app de Next.js (que también revisa SIIAU cada minuto) en una VM gratuita, con la base
de datos en Turso. Todo con planes gratuitos; los límites de abajo eran los vigentes al escribir
esto, revísalos antes de lanzar.

| Pieza            | Servicio                   | Plan gratuito (lo que importa aquí)                      |
| ---------------- | -------------------------- | -------------------------------------------------------- |
| Base de datos    | Turso                      | 5 GB, 500 M filas leídas y 10 M escritas al mes          |
| Servidor         | Oracle Cloud (Always Free) | VM Ampere A1 de hasta 4 núcleos y 24 GB; pide tarjeta    |
| HTTPS            | Caddy + Let's Encrypt      | Gratis; necesita un dominio (o un subdominio de DuckDNS) |
| Correo           | Resend                     | 100 correos al día, 3 000 al mes, 1 dominio              |
| Bot              | Telegram                   | Gratis                                                   |
| Notificaciones   | Web Push                   | Gratis (los servicios de push de los navegadores)        |
| CI y despliegues | GitHub Actions             | Gratis en repositorios públicos                          |

Por qué una VM y no Netlify o Vercel: la [decisión 30](decisions.md). Necesitas Node 24 y pnpm
10 en tu máquina para los scripts, y el repositorio clonado con `pnpm install` hecho.

## 1. Turso (base de datos)

1. Crea una cuenta en [turso.tech](https://turso.tech) e instala la CLI:

   ```sh
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```

2. Crea la base, cerca de donde estará la VM (la CLI lista las ubicaciones con
   `turso db locations`):

   ```sh
   turso db create haycupo
   turso db show haycupo --url        # → TURSO_DATABASE_URL (libsql://…)
   turso db tokens create haycupo     # → TURSO_AUTH_TOKEN (es una contraseña)
   ```

3. Las migraciones se aplican solas cuando arranca la app. Si quieres aplicarlas antes, desde tu
   máquina: `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… pnpm --filter @haycupo/db migrate`.

4. **Periodos de registro.** Las alertas se apagan solas al terminar el registro del ciclo, y
   durante esos días se revisa cada 2 minutos. La migración trae 2027A (11 al 15 de enero de
   2027, hora de Guadalajara); **confirma las fechas con el calendario oficial de la UdeG** y
   agrega cada ciclo nuevo con `turso db shell haycupo` (las fechas se guardan en milisegundos):

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

## 3. La VM en Oracle Cloud

1. Crea una cuenta en [cloud.oracle.com](https://cloud.oracle.com). Pide tarjeta para verificar
   identidad; lo que entra en _Always Free_ no se cobra.
2. **Compute → Instances → Create instance:**
   - Imagen: **Ubuntu 24.04**.
   - Shape: **VM.Standard.A1.Flex** (Ampere, ARM) con 2 núcleos y 12 GB sobra. Si en tu región
     no hay capacidad, prueba otro _availability domain_ o más tarde.
   - Sube tu llave SSH pública.
3. **Abre los puertos 80 y 443**, en dos lugares (es el tropiezo más común):
   - En la red: **Networking → Virtual cloud networks → tu VCN → Security lists → Default →
     Add ingress rules**: origen `0.0.0.0/0`, TCP, puertos `80` y `443`.
   - En la VM (las imágenes de Oracle traen reglas de iptables propias):

     ```sh
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

4. Instala Docker:

   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER     # sal y vuelve a entrar por SSH para que aplique
   ```

5. **Dominio:** crea un registro `A` que apunte a la IP pública de la VM. Sin dominio propio,
   un subdominio gratuito de [DuckDNS](https://www.duckdns.org) funciona igual.
6. **Ojo con las VMs "inactivas":** Oracle puede recuperar instancias _Always Free_ que pasan 7
   días casi sin uso de CPU, red y memoria. Esta app usa poco; para evitarlo, cambia la cuenta a
   _Pay As You Go_ (sigue sin costo mientras no salgas de lo _Always Free_) o vigila el aviso
   por correo de Oracle.

Cualquier otra VM con Docker sirve igual. En una de 1 GB de memoria (por ejemplo la e2-micro
gratuita de Google Cloud) agrega 2 GB de swap: compilar Next.js necesita más.

## 4. Primer despliegue

1. Copia el código a la VM (desde tu máquina, en la raíz del repositorio):

   ```sh
   rsync -az --exclude .git --exclude node_modules --exclude .env ./ ubuntu@<ip>:haycupo/
   ```

2. En la VM, crea `~/haycupo/.env` a partir de `.env.example` con los valores de producción.
   Lo indispensable:

   ```sh
   SITE_DOMAIN=haycupo.tudominio.com
   APP_URL=https://haycupo.tudominio.com
   TURSO_DATABASE_URL=libsql://haycupo-<tu-organización>.turso.io
   TURSO_AUTH_TOKEN=…
   APP_SECRET=…            # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   INTERNAL_API_TOKEN=…    # otro distinto, igual de largo
   SIIAU_CONTACT_EMAIL=…   # público: SIIAU lo ve y la página de privacidad lo muestra
   EMAIL_TRANSPORT=resend
   RESEND_API_KEY=…
   EMAIL_FROM=¿Hay Cupo? <avisos@tudominio.com>
   SIIAU_ORIGIN_OVERRIDE=  # ¡vacío! con un valor, la app consultaría al SIIAU falso
   ```

   Opcionales: Telegram ([docs/telegram.md](telegram.md)) y `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY` (`pnpm --filter @haycupo/notify vapid` en tu máquina; si las cambias
   después, las suscripciones existentes dejan de servir). Protege el archivo:
   `chmod 600 ~/haycupo/.env`.

3. Construye y arranca (la primera vez tarda unos minutos):

   ```sh
   cd ~/haycupo && docker compose up -d --build
   docker compose ps                 # app "healthy" y caddy "running"
   docker compose logs -f app        # "Scheduler started: polling SIIAU every minute."
   ```

4. Abre `https://haycupo.tudominio.com/estado`. Caddy obtiene el certificado en el primer
   acceso; si falla, revisa que el DNS ya apunte a la VM y que los puertos 80 y 443 estén
   abiertos.

5. **Antes de anunciar el sitio:** busca una materia real del ciclo actual y compárala con
   SIIAU. Es la primera vez que el parser ve páginas reales desde ese servidor (el entorno de
   desarrollo no podía llegar a SIIAU); si algo no cuadra, `docker compose logs app` y la tabla
   de peticiones en `/estado` lo dirán.

## 5. GitHub Actions (despliegues automáticos)

Desde entonces, cada _push_ a `main` corre CI y, si pasa, `Deploy` copia el código a la VM y
corre `docker compose up -d --build`. Para activarlo:

1. Una llave solo para desplegar (en tu máquina):

   ```sh
   ssh-keygen -t ed25519 -f haycupo-deploy -N "" -C "github-actions"
   ssh-copy-id -i haycupo-deploy.pub ubuntu@<ip>
   ssh-keyscan -t ed25519 <ip>       # compara la huella con la de la consola de Oracle
   ```

2. En el repositorio, **Settings → Secrets and variables → Actions**:
   - **Secrets:** `VM_SSH_KEY` (el contenido de `haycupo-deploy`, la privada) y
     `VM_KNOWN_HOSTS` (la línea que imprimió `ssh-keyscan`).
   - **Variables:** `VM_HOST` (la IP), `VM_USER` (`ubuntu`), `SITE_DOMAIN` y
     `DEPLOY_ENABLED` = `true`.
3. Borra `haycupo-deploy` de tu máquina cuando lo hayas guardado en GitHub.

Opcional: en **Settings → Environments → production** puedes pedir aprobación manual antes de
cada despliegue. También puedes lanzarlo a mano en **Actions → Deploy → Run workflow**.

## 6. Revisión después de desplegar

1. `/estado` dice "Todo funciona" (la primera revisión programada corre a los pocos segundos de
   arrancar).
2. Crea una alerta con tu correo y revisa en `/estado` que la materia aparezca vigilada.
3. Prueba el freno de emergencia:

   ```sh
   curl -X POST "https://haycupo.tudominio.com/api/internal/brake" \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"action":"pause","minutes":5,"reason":"prueba"}'
   ```

   `/estado` debe mostrar "En pausa". Para reanudar: `-d '{"action":"resume"}'`.

## Operar durante la semana de registro

- **Frenar todo** al instante: el `curl` de arriba (hasta 7 días). Para apagarlo del todo,
  `SIIAU_ENABLED=false` en el `.env` de la VM y `docker compose up -d`.
- **Si SIIAU va lento**, sube `SIIAU_MIN_DELAY_MS` o `POLL_REGISTRATION_INTERVAL_SECONDS` en el
  `.env`. Nunca por debajo de los mínimos (2 s y 2 minutos): la app no arranca con valores
  menores.
- **Correo:** el plan gratuito de Resend permite 100 al día; la app se detiene en 90 (los
  enlaces para entrar cuentan). `/estado` muestra cuántos van. Si se acaba, Telegram y las
  notificaciones siguen funcionando.
- **Registros en vivo:** `docker compose logs -f app` en la VM.
- **Si la VM se reinicia**, Docker levanta todo solo (`restart: unless-stopped`).

## Desarrollo local (sin cuentas)

No necesitas Turso para desarrollar: con `TURSO_DATABASE_URL=file:../../data/local.db` (el
valor de `.env.example`) la app usa un archivo SQLite en `data/`. Ver el README.
