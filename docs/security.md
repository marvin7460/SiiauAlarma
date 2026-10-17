# Seguridad

Cómo está protegido ¿Hay Cupo?, pensado para su tamaño real: unos cien estudiantes y, de vez en
cuando, alguien que quiere molestar. Para reportar una vulnerabilidad: [SECURITY.md](../SECURITY.md).

## Qué hay que cuidar

- **Lo gratuito, que se acaba:** los 300 créditos mensuales de Netlify (si se agotan, Netlify
  pausa el sitio hasta el mes siguiente; nunca cobra), los 100 correos diarios de Resend y el
  turno para consultar SIIAU.
- **Los datos:** correos de los estudiantes, chats de Telegram, suscripciones a notificaciones.
- **SIIAU:** que nadie use el proyecto para saturarlo.

## Ataques y defensas

| Ataque                                                               | Qué pasaría                                                        | Defensa                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inundar el sitio de peticiones (un script, un "DDoS" casero)         | Gastar los créditos y que se pause el sitio                        | Portero en el borde de Netlify: 90 peticiones por minuto por IP; arriba de eso Netlify responde 429 sin ejecutar nuestro código ([gate.ts](../apps/web/netlify/edge-functions/gate.ts)). Protección DDoS de red de Netlify |
| Pedir enlaces de entrada para muchos correos                         | Llenar de correos a otras personas; gastar los 100 correos del día | 3 enlaces por correo cada 15 min y 8 al día; 6 por conexión cada hora; el sitio se detiene en 90 correos al día                                                                                                            |
| Inventar búsquedas para acaparar SIIAU                               | "SIIAU está ocupado" para todos; alertas atrasadas                 | Solo ciclos y centros que existen; 12 búsquedas nuevas por conexión cada 10 min y 10 por minuto entre todos (las alertas siempre tienen turno); lo que ya se buscó sale de la caché sin límite                             |
| Crear alertas o cuentas en masa                                      | Llenar la base y atrasar la revisión                               | Máximo 15 alertas activas y 30 nuevas por hora por cuenta; cada cuenta necesita recibir un correo (limitado arriba)                                                                                                        |
| Inundar el bot de Telegram                                           | Gastar créditos con cada mensaje                                   | El bot calla después de 20 mensajes por minuto de un chat; solo chats privados; Telegram firma cada llamada con un secreto                                                                                                 |
| Inyección SQL                                                        | Leer o borrar la base                                              | Todas las consultas van con parámetros (Drizzle); ninguna se arma pegando texto                                                                                                                                            |
| XSS (meter código en la página)                                      | Robar sesiones                                                     | React escapa todo; los correos y los mensajes de Telegram escapan lo que insertan; la política de contenido (CSP) solo permite scripts del propio sitio; la cookie de sesión no es visible para JavaScript                 |
| Clickjacking (la página dentro de un iframe ajeno)                   | Engañar a alguien para que haga clic                               | `frame-ancestors 'none'` y `X-Frame-Options: DENY`                                                                                                                                                                         |
| CSRF (una página ajena actúa en tu nombre)                           | Crear o borrar alertas, borrar la cuenta                           | Next.js compara el origen de cada Server Action; cookie `SameSite=Lax`; cancelar desde el correo usa un enlace firmado (HMAC)                                                                                              |
| Redirección abierta después de entrar                                | Mandar a alguien a una página falsa                                | `safeNext` solo acepta rutas de este sitio y rechaza `//`, `\`, tabuladores y saltos de línea                                                                                                                              |
| Adivinar o robar una sesión o un enlace de entrada                   | Entrar como otra persona                                           | Tokens aleatorios de 256 bits; en la base solo su SHA-256; enlaces de 15 min y un solo uso; cookie `__Host-` Secure y httpOnly; HTTPS obligatorio (HSTS); la página del enlace no se guarda en caché ni envía Referer      |
| Ver o cambiar datos de otra cuenta                                   | Leer alertas ajenas                                                | Cada consulta filtra por la cuenta de la sesión                                                                                                                                                                            |
| Usar las notificaciones push para que el servidor llame a otro sitio | Usar el servidor como proxy (SSRF)                                 | Solo se aceptan servicios de push reales (Google, Mozilla, Apple, Microsoft)                                                                                                                                               |
| Probar tokens contra `/api/internal`                                 | Frenar o forzar la revisión de SIIAU                               | Token de 32 o más caracteres, comparado en tiempo constante                                                                                                                                                                |
| Dependencias con vulnerabilidades                                    | Un fallo ajeno en nuestro sitio                                    | `pnpm audit --prod` sin hallazgos; parches forzados en `pnpm-workspace.yaml`; Dependabot mensual; CodeQL en cada push                                                                                                      |
| Secretos en el repositorio                                           | Que alguien use nuestras cuentas                                   | `.env*` en `.gitignore`; el historial completo se revisó y no tiene secretos                                                                                                                                               |
| Un workflow de GitHub comprometido                                   | Publicar código ajeno                                              | Permisos de solo lectura; el despliegue corre a mano o con etiqueta, con el environment `production`                                                                                                                       |

Los límites están en [packages/engine/src/limits.ts](../packages/engine/src/limits.ts). Los
contadores nunca guardan una IP ni un correo: guardan una huella HMAC que no se puede revertir
sin el `APP_SECRET`, y se borran al día siguiente. Las pruebas: `packages/engine/test/limits.test.ts`
y `apps/web/e2e/security.spec.ts` (encabezados, cero violaciones de CSP, el séptimo enlace desde
la misma conexión se rechaza).

## Lo que no se puede blindar del todo

- **Una inundación grande desde muchas IPs.** El portero frena a cada IP, y Netlify tiene
  protección DDoS de red, pero su documentación no dice si las peticiones rechazadas cuentan en
  los créditos. En el peor caso el plan gratuito no cobra: pausa el sitio. Para eso está el plan
  de abajo.
- **`'unsafe-inline'` en los scripts.** Next.js escribe los datos de cada página como scripts en
  línea; quitarlo exige un nonce por petición con un proxy (middleware) en cada visita. Como no
  hay ningún lugar donde un usuario pueda meter HTML, el beneficio es pequeño; el resto de la CSP
  sigue bloqueando scripts, marcos y formularios de otros sitios.
- **`braces`**, que usa ESLint al revisar el código, tiene un aviso sin versión corregida. Solo
  corre en tu computadora y en CI, nunca en el sitio.

## Si alguien ataca

1. **Mira qué pasa:** Netlify → Logs & metrics (funciones, peticiones) y Usage & billing
   (créditos). `/estado` muestra las consultas a SIIAU.
2. **Frena SIIAU si hace falta** (instantáneo, sin desplegar):

   ```sh
   curl -X POST https://tudominio.me/api/internal/brake \
     -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "Content-Type: application/json" \
     -d '{"action":"pause","minutes":60,"reason":"abuso"}'
   ```

3. **Si es una inundación de peticiones, pon Cloudflare delante (gratis):** crea una cuenta,
   agrega tu dominio, copia ahí todos los registros DNS (los de Netlify y los de Resend; los de
   Resend en modo "DNS only", nube gris), cambia los nameservers en Namecheap a los de Cloudflare,
   activa el proxy (nube naranja) en `@` y `www`, pon SSL/TLS en **Full (strict)** y, durante el
   ataque, **Security → Under Attack Mode**. Las peticiones que Cloudflare bloquea nunca llegan
   a Netlify.
4. **Si abusan del bot:** en @BotFather, `/revoke` cambia el token; actualízalo en Netlify,
   vuelve a desplegar y reconecta el webhook.
5. **Si se filtró un secreto:** regenera ese secreto (abajo dónde), actualízalo en Netlify y en
   GitHub, y vuelve a desplegar.

## Ajustes que tienes que activar tú

**GitHub** (Settings del repositorio):

- [ ] Code security → **Secret scanning** y **Push protection** (gratis en repositorios públicos):
      GitHub bloquea un push que traiga un token.
- [ ] Code security → **Dependabot alerts** y **Dependabot security updates**.
- [ ] Code security → **Private vulnerability reporting** (lo usa SECURITY.md).
- [ ] **No** actives el "default setup" de CodeQL: el workflow `CodeQL` ya lo hace y no pueden
      correr juntos.
- [ ] Rules → **Rulesets** para `main`: pedir pull request, CI en verde y bloquear force push.
- [ ] Activa la verificación en dos pasos en tu cuenta.

**Netlify:**

- [ ] Team settings → **Usage & billing**: activa los avisos de uso para enterarte antes de que
      se acaben los créditos.
- [ ] Site configuration → Build & deploy → **Deploy previews**: desactívalas, o deja la
      "Sensitive variable policy" en **Require approval** para pull requests de forks (el
      repositorio es público).
- [ ] Marca como secretas solo las variables que lo son (tokens y llaves), no los ajustes.
- [ ] Verificación en dos pasos en Netlify, Turso, Resend y Namecheap.

**Secretos que pasaron por un chat:** regenera el token de Netlify (User settings →
Applications), la API key de Resend, el token de Turso (`turso db tokens create`) y el del bot
(`/revoke` en @BotFather). Después actualízalos en Netlify (y en GitHub los que estén ahí), vuelve
a desplegar y reconecta el webhook de Telegram.
