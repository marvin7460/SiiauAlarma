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

## 8. Parser con `htmlparser2` y validación con Zod (se implementa en la Fase 1)

- **Elegido:** dos capas. Primero se extraen filas y celdas con `htmlparser2` en modo streaming, sin construir un DOM. Luego esas filas se convierten en objetos del dominio, validados con Zod.
- **Por qué:** `htmlparser2` es JS puro y corre igual en Node, Vitest y Workers. Normaliza mayúsculas y comillas del HTML antiguo de SIIAU. Si el benchmark muestra que no alcanza el CPU de Workers, se cambia la primera capa por HTMLRewriter sin tocar la segunda ni sus tests.
