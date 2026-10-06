# Decisiones técnicas

Registro corto de las decisiones importantes: qué se eligió, por qué y qué se sacrificó. Cada entrada se escribe cuando se toma la decisión, no al final.

## 1. Sondeo en Cloudflare Workers, con plan B en una VM (Fase 0, pendiente de la prueba)

- **Elegido:** Cloudflare Workers con Cron Triggers y un Durable Object como única salida hacia SIIAU.
- **Por qué:** es gratis y sin tarjeta, el cron corre cada minuto y el tiempo esperando a la red no cuenta como CPU. Un Durable Object procesa una petición a la vez, así que sirve de candado global sin infraestructura extra.
- **Costo:** 10 ms de CPU y 50 subpeticiones por ejecución en el plan gratuito, lo que obliga a trabajar en lotes chicos y a medir el parser. Además, SIIAU podría bloquear las IPs de Cloudflare.
- **Descartado:** GitHub Actions (cron de 5 min como mínimo, con retrasos y ejecuciones perdidas); Vercel Cron en Hobby (una vez al día); VM gratuita de Oracle como primera opción (pide tarjeta, Oracle detiene las VMs "inactivas" y tú mantienes el servidor). La VM queda como plan B.
- **Mitigación:** el ciclo de sondeo recibirá por parámetro el cliente HTTP, la base de datos, los notificadores y el reloj. Mudarse de plataforma solo cambia el punto de entrada.
- **Se confirma con:** `tools/cf-probe`.

## 2. Supabase en lugar de Neon (Fase 0)

- **Elegido:** Postgres de Supabase, usado solo como Postgres (con Drizzle), sin su Auth ni su API.
- **Por qué:** Neon cobra el cómputo por tiempo encendido (100 horas-CU al mes gratis) y apaga la base tras 5 minutos sin consultas. Un cron cada minuto la tendría encendida todo el mes, unas 180 horas-CU. Supabase da un Postgres siempre encendido; su pausa por 7 días de inactividad no aplica porque el sondeo genera actividad constante.
- **Costo:** 500 MB de base de datos. Hay que guardar solo lo necesario (estado actual por sección y eventos, no todo el historial).

## 3. Paquetes internos sin paso de build (Fase 0)

- **Elegido:** cada paquete exporta su código TypeScript directamente (`"exports": "./src/index.ts"`). Next.js y Wrangler lo compilan al empaquetar; Vitest y `tsx` lo ejecutan tal cual.
- **Por qué:** menos configuración, nada de `dist/` que se desincronice y "ir a la definición" llega al código real.
- **Costo:** los paquetes no se pueden publicar en npm tal como están. No hace falta.

## 4. ESLint + Prettier en lugar de Biome (Fase 0)

- **Por qué:** las reglas de Next.js (`@next/eslint-plugin-next`) y de React Hooks solo existen para ESLint. Con `strictTypeChecked` de typescript-eslint, el lint también detecta promesas sin `await` y condiciones siempre verdaderas.
- **Costo:** más lento que Biome y dos herramientas en lugar de una.

## 5. TypeScript 6.0 y no 7 (Fase 0)

- **Por qué:** TypeScript 7 (el compilador nativo) ya salió, pero typescript-eslint aún solo soporta hasta la 6.0. Se actualiza cuando lo soporte.

## 6. Fixtures como bytes exactos (Fase 0)

- **Elegido:** cada fixture guarda los bytes tal como llegaron (ISO-8859-1) más un `.meta.json` con URL, fecha, estado, algunos encabezados y el SHA-256. `.gitattributes` marca la carpeta como `-text`.
- **Por qué:** si se guardara el HTML ya decodificado, los tests no probarían la decodificación, que es justo donde se rompen la Ñ y los acentos. Git no debe convertir finales de línea ni codificación.
- **Privacidad:** los `.meta.json` nunca guardan cookies.

## 7. `robots.txt` según el RFC 9309 (Fase 0)

- **Elegido:** 2xx → se respetan las reglas para `HayCupo` (o `*`). 4xx → no hay restricciones. 5xx, 429, errores de red u otros estados → se asume que todo está prohibido. Si `robots.txt` pide `Crawl-delay`, se respeta cuando es mayor que nuestra pausa.
- **Por qué:** es el estándar, y ante la duda el proyecto se detiene en lugar de insistir.

## 8. Parser con `htmlparser2` y validación con Zod (Fase 1)

- **Elegido:** dos capas. Primero se extraen tablas, filas y celdas con `htmlparser2` en modo streaming, sin construir un DOM. Luego esas filas se convierten en objetos del dominio, validados con Zod.
- **Por qué:** `htmlparser2` es JS puro y corre igual en Node, Vitest y Workers. Normaliza mayúsculas y comillas del HTML antiguo de SIIAU y tolera etiquetas sin cerrar. Si algún día no alcanza el CPU, se cambia la primera capa por HTMLRewriter sin tocar la segunda ni sus tests.
- **Estricto a propósito:** si falta el pie "Total de registros", si un número no es número, si hay más filas que registros o un NRC repetido, el parser lanza `SiiauParseError`. Es preferible no avisar que avisar mal.
- **Días por posición:** se leen las seis posiciones (lunes a sábado) en lugar de las letras, así no importa qué letra use SIIAU para cada día.
- **Benchmark** (`pnpm --filter @haycupo/siiau benchmark`, Node 22, mediana de 50 corridas, decodificar + parsear + validar):

  | Secciones | Bytes   | ms   |
  | --------- | ------- | ---- |
  | 5         | 4 008   | 0.7  |
  | 30        | 23 434  | 2.3  |
  | 100       | 77 825  | 7.2  |
  | 500       | 388 625 | 36.6 |

  Con 10 ms de CPU por invocación en el plan gratuito de Workers, cabe una materia típica por invocación, pero no diez. Por eso el sondeo en Workers procesa **una materia por invocación** (ver la decisión 10).

## 9. Tabla propia para windows-1252 (Fase 1)

- **Problema:** el `TextDecoder("windows-1252")` de Node decodifica como ISO-8859-1 puro: el byte 0x93 da un carácter de control en lugar de “. Workers sigue el estándar. El mismo byte daría resultados distintos en los tests y en producción.
- **Elegido:** si el cuerpo no tiene bytes 0x80–0x9F (lo normal), se usa `TextDecoder("latin1")`, que en ese rango coincide en todos los runtimes. Si aparece alguno, se decodifica con una tabla propia de 32 posiciones.

## 10. Un `TODO(Marvin)` que no bloquee la app (Fase 1)

- **Cambio:** el plan proponía `parseDays()` como ejercicio de la Fase 1. Al pedirse ejecutar todas las fases sin pausas, una función crítica sin implementar dejaría la app sin funcionar. Los ejercicios pasan a ser piezas aisladas con un comportamiento provisional seguro y sus tests ya escritos, marcados con `.skip`.

## 11. El worker es la única salida hacia SIIAU (Fase 2)

- **Elegido:** la web (Vercel) nunca llama a SIIAU. Le pide los datos al worker por una API interna protegida con un token compartido (`INTERNAL_API_TOKEN`), y el worker es el único que habla con SIIAU.
- **Por qué:** una sola salida significa un solo User-Agent, un solo límite de ritmo y un solo lugar donde frenar. Además, la web no necesita saber nada de HTML ni de ISO-8859-1.
- **Contrato:** `apps/worker/src/contract.ts` define con Zod las respuestas. La web valida lo que recibe con los mismos esquemas, así que un cambio en un lado es un error de tipos en el otro.

## 12. Turnos para SIIAU en una fila de Postgres, no en un Durable Object (Fase 2)

- **Cambio respecto al plan:** el plan proponía un Durable Object como candado global. Al implementarlo, una fila en Postgres (`siiau_gateway`) resolvió lo mismo de forma más simple: un _lease_ para que solo haya una petición en curso, la hora de fin de la última petición para respetar la pausa (medida con el reloj de la base de datos, así dos máquinas no discuten) y el contador del freno automático.
- **Por qué:** funciona igual en Cloudflare, en una VM y en las pruebas (PGlite). Un Durable Object habría atado el diseño a Cloudflare y el plan B no habría servido sin reescribirlo.
- **Costo:** unas cuantas consultas a la base por cada petición a SIIAU, y quien espera turno consulta la fila cada ≤1 s. Con nuestro volumen (máximo ~20 peticiones por minuto) es despreciable.
- **Freno automático:** tras 5 errores seguidos se pausa todo 15 minutos; cada vez seguida que se dispara, la pausa se duplica (hasta 6 horas). Un éxito lo reinicia. También hay un interruptor (`SIIAU_ENABLED=false`) y una pausa manual (`paused_until` en la fila).

## 13. Caché compartida por consulta y autocompletado sin tocar SIIAU (Fase 2)

- **Caché:** cada consulta (ciclo, centro, clave o nombre) guarda su último resultado en `offer_snapshots`. Durante 5 minutos todas las búsquedas iguales lo reutilizan. Si SIIAU falla, se muestra el último resultado marcado como "desactualizado" en lugar de un error.
- **Autocompletado:** sugiere materias que ya aparecieron en algún resultado (`subjects`). Escribir nunca genera peticiones a SIIAU; el catálogo crece solo conforme la gente busca.
- **Costo:** la primera vez que alguien busca una materia que nadie ha buscado, no hay sugerencia. Siempre se puede escribir la clave o el nombre completo.

## 14. Next.js 16 sin Cache Components (Fase 2)

- **Elegido:** el modelo de caché "anterior" (no está deprecado). Las páginas con búsqueda son dinámicas y la caché importante vive en el worker y en Postgres, no en Next.
- **Por qué:** activar `cacheComponents` agrega reglas de prerenderizado que no nos dan nada aquí, y una portada prerenderizada al compilar habría congelado el error de "no pudimos cargar los ciclos".

## 15. Magic link escrito a mano, no Better Auth (Fase 3)

- **Cambio respecto al plan:** el plan proponía Better Auth. Al implementarlo se eligió un flujo propio de unas 150 líneas (`apps/web/src/lib/auth.ts`).
- **Por qué:** el requisito de "datos mínimos". Better Auth guarda por defecto IP y User-Agent de cada sesión, y agrega tablas y campos (nombre, imagen, cuentas) que aquí sobran. El flujo propio guarda solo el correo.
- **Cómo se cubre la seguridad:** tokens aleatorios de 32 bytes, y en la base solo su SHA-256 (quien lea la base no puede entrar); enlaces de un solo uso que vencen en 15 minutos, consumidos con un `UPDATE … WHERE used_at IS NULL` atómico; cookie `httpOnly`, `SameSite=Lax` y `Secure` en HTTPS; redirecciones solo a rutas internas (sin _open redirect_); máximo 3 enlaces por correo cada 15 minutos. Las Server Actions de Next ya comparan `Origin` con `Host` (CSRF).
- **Detalle importante:** el enlace del correo abre una página con un botón "Entrar", y solo el botón (un POST) inicia la sesión. Algunos servidores de correo abren los enlaces para revisarlos; si abrir el enlace bastara, el escáner lo gastaría.

## 16. Sondeo por materia con `FOR UPDATE SKIP LOCKED` (Fase 3)

- Cada ciclo reclama la materia más atrasada con un solo `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)` y adelanta su próxima consulta 5 minutos. Dos procesos (dos cron que se traslapan, o varias invocaciones en Workers) nunca sondean la misma materia.
- Las alertas se agrupan por (ciclo, centro, clave): una petición a SIIAU sirve a todas las alertas de esa materia. La prueba de integración lo verifica contando peticiones.
- Solo se consultan materias con al menos una alerta activa. Las alertas vencen solas (al terminar el registro del ciclo, tabla `registration_windows`), y una materia sin alertas deja de consultarse.
- Intervalos: 5 minutos normal, 2 en la semana de registro, 1 hora si la oferta no está publicada. Con errores, _backoff_ exponencial por materia (hasta 1 hora), aparte del freno global del gateway.

## 17. Nunca avisar en falso (Fase 3)

- Solo cuentan las **transiciones**: 0 → 1 o más es noticia; 3 → 2 no. El primer sondeo de una materia solo fija la línea base.
- Si SIIAU falla, cambia su HTML o de pronto devuelve cero secciones de una materia que tenía, no se avisa a nadie: se registra el error, se conserva el estado anterior y se reintenta con _backoff_.
- Anti-spam: una alerta avisa como máximo una vez cada 30 minutos (configurable), aunque el lugar aparezca y desaparezca varias veces. La prueba "does not spam when a seat flaps" lo cubre.
- Un aviso de "hay cupo" con más de 30 minutos de retraso se descarta: el lugar ya no estaría.

## 18. Bandeja de salida (_outbox_) para los avisos (Fase 3)

- El sondeo escribe los avisos en la tabla `notifications` dentro de la misma transacción que actualiza el estado. Otro paso, el despachador, los envía.
- **Por qué:** si el correo falla, el sondeo no se repite ni se pierde el aviso. El despachador reintenta (hasta 3 veces), respeta la cuota diaria de Resend (100 al día en el plan gratuito; usamos 90) y cada canal nuevo (Telegram, push) se agrega en un solo lugar.
- Los avisos se reclaman con `SKIP LOCKED`, así que dos despachadores no mandan el mismo correo.

## 19. Una invocación de Workers por materia (Fase 3)

- En Cloudflare, el cron de cada minuto solo orquesta: llama al mismo Worker (_service binding_ `SELF`) una vez por materia (`POST /internal/poll-one`). Cada materia se procesa en su propia invocación, con sus propios 10 ms de CPU. El benchmark de la decisión 8 dice que una materia típica cabe; diez juntas no.
- **A verificar en producción:** que cada invocación por _service binding_ tenga su propio límite de CPU (así lo indica la documentación de Cloudflare), y el tiempo de CPU real en el panel de Workers. Si no alcanza: `POLL_MODE=inline` con Workers Paid (5 USD al mes) o el plan B en Node (la misma app; `pnpm --filter @haycupo/worker start`).

## 20. Correos con enlaces firmados y baja en un clic (Fase 3)

- "Cancelar esta alerta" funciona sin iniciar sesión: el enlace lleva un HMAC-SHA256 del id de la alerta con `APP_SECRET`. No se guarda nada, el worker firma y la web verifica.
- Cada correo de alerta trae `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058): Gmail y otros muestran un botón "Cancelar suscripción" que llama a `POST /api/alertas/cancelar`.

## 21. Bot de Telegram por _webhook_, con la respuesta en la misma llamada (Fase 4)

- Telegram llama a `POST /telegram/webhook` del worker con cada mensaje. El worker comprueba la cabecera `X-Telegram-Bot-Api-Secret-Token` (el secreto que se registró con `setWebhook`) y responde con el `sendMessage` en el cuerpo de la respuesta: Telegram lo ejecuta, así que contestar no cuesta una petición extra ni tiempo de CPU del Worker.
- **Vincular la cuenta:** la web genera un código de un solo uso (15 minutos, en la base solo su SHA-256) y abre `t.me/<bot>?start=<código>`. Al pulsar "Iniciar", el bot recibe `/start <código>` y guarda el `chat_id` en la cuenta. Así nadie escribe su correo en Telegram y un chat ajeno no puede "adivinar" una cuenta.
- Solo chats privados: en un grupo, las alertas de una persona quedarían a la vista de todos.
- Si alguien bloquea el bot, Telegram responde 403 al enviar: se desvincula el chat y no se reintenta.
- Para desarrollo local (Telegram no llega a `localhost`): `pnpm --filter @haycupo/worker telegram dev` lee los mensajes con _long polling_ y se los pasa al worker local tal como lo haría el webhook.

## 22. Notificaciones del navegador con Web Push estándar (Fase 4)

- Cifrado (RFC 8291) y firma VAPID (RFC 8292) con WebCrypto, mediante `@block65/webcrypto-web-push`, porque el paquete clásico `web-push` depende de módulos de Node que no existen en Workers. Una prueba descifra el mensaje como lo haría el navegador, para comprobar que el cifrado es correcto y no solo "que no truena".
- Sin servicios de terceros (OneSignal, Firebase SDK): las llaves VAPID son nuestras y el navegador habla con su propio servicio de push.
- Los avisos tienen TTL de 10 minutos: un "hay cupo" de hace una hora no sirve.
- **Seguridad:** el worker hace un POST a la URL (`endpoint`) que entrega el navegador. Para que nadie registre una URL arbitraria y use al worker para hacer peticiones a otros servidores, solo se aceptan los servicios de push de los navegadores reales (Google, Mozilla, Apple, Microsoft), en la web al guardar y otra vez en el worker antes de enviar.
- Suscripciones que el servicio da por muertas (404/410) o que fallan 5 veces seguidas se borran.
- **iPhone:** Safari solo permite push a sitios agregados a la pantalla de inicio (iOS 16.4+). Por eso hay `manifest.webmanifest` e íconos, y la página lo explica cuando detecta un iPhone.

## 23. Un canal solo se ofrece si puede llegar (Fase 4)

- En el formulario de alerta, Telegram y las notificaciones aparecen desactivados hasta que la persona los conecta, y el servidor vuelve a filtrar los canales al crear la alerta. Una alerta "solo por Telegram" sin Telegram conectado sería una alerta muda.
