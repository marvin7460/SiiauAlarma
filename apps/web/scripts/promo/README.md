# Video promocional

Un video vertical de 36 segundos (1080 × 1920, 30 fps) para TikTok, Reels y Shorts. Usa
pantallas reales de la app, capturadas contra el SIIAU falso, y animaciones tipo motion
graphics. Todo se genera con código, así que se puede volver a renderizar cuando cambie la app
o el dominio.

## Cómo generarlo

Necesitas ffmpeg instalado (en Windows: `winget install Gyan.FFmpeg`).

```sh
pnpm --filter @haycupo/web promo:screens                      # capturas reales, a tamaño de celular
pnpm --filter @haycupo/web promo:render                       # → scripts/promo/out/haycupo-promo.mp4
pnpm --filter @haycupo/web promo:render --cta "haycupo.me"    # con tu dominio en lugar de "Link en la bio"
pnpm --filter @haycupo/web promo:render --stills 3,20,34      # solo unos cuadros en PNG, para revisar
pnpm --filter @haycupo/web promo:render --voice voz.wav       # con tu narración; la música baja sola
pnpm --filter @haycupo/web promo:render --reuse-video         # rehace solo el audio
pnpm --filter @haycupo/web promo:render --mute                # sin audio
```

## Audio

La música y los efectos se generan con código en `soundtrack.ts`: no usan grabaciones ni
canciones de nadie, así que no hay problema de derechos. Es una pista pop-electrónica a 128 BPM
en Do mayor (Do–Sol–Lam–Fa) con efectos en cada animación:

- un clic por cada recarga del contador del gancho, que se aceleran, y un latido debajo;
- un golpe y una campana cuando aparece el logo;
- un toque en cada clic del dedo, barridos en cada cambio de pantalla y notas en las tarjetas;
- un corte antes del 0 → 1 con un redoble, y el "drop" justo cuando el contador cambia;
- un "ding" distinto para el aviso de Telegram, el correo y la notificación;
- un acorde final a los 34 s que se desvanece.

El audio sale normalizado a -14 LUFS (lo que usan TikTok, Instagram y YouTube). Para narrar,
graba tu voz siguiendo el guion de abajo (un WAV o MP3 de 36 s, empezando en el segundo 0) y pásalo
con `--voice`: la música baja automáticamente mientras hablas.

Para ver un momento en el navegador, abre `video.html?t=12.5` (después de `promo:screens`).

## Guion

| Tiempo  | Escena                   | En pantalla                                                                                                 |
| ------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 0–4 s   | Gancho                   | "¿Otra vez recargando SIIAU cada 5 minutos?" y un contador de recargas que sube mientras el cupo sigue en 0 |
| 4–7 s   | Logo                     | Un círculo verde tapa la pantalla, la campana suena y aparece "¿Hay Cupo?" con su lema                      |
| 7–12 s  | 1. Busca tu materia      | La app real en un teléfono: búsqueda, secciones, "Sin lugares" resaltado y toque en "Avísame"               |
| 12–18 s | 2. Pide que te avisemos  | El formulario real; entran las tarjetas Correo, Telegram y Notificación; toque en "Crear alerta" ✓          |
| 18–25 s | 3. Alguien la da de baja | El contador gira de 0 a 1 y llegan los tres avisos, con el texto real del mensaje                           |
| 25–31 s | Gratis y sin trucos      | Gratis · Sin tu contraseña · Sin spam · Se apaga sola · Sin rastreadores                                    |
| 31–36 s | Cierre                   | Logo, "Pide tu aviso gratis", el enlace y "No afiliado a la Universidad de Guadalajara"                     |

Narración opcional (unos 30 s, para grabar encima o usar la voz de texto de TikTok):

> ¿Otra vez recargando SIIAU cada cinco minutos? Con ¿Hay Cupo? buscas tu materia, ves cuántos
> lugares quedan y pides que te avisemos. Cuando alguien la da de baja, te llega el aviso por
> correo, Telegram o notificación en minutos. Es gratis, nunca te pedimos tu contraseña y la
> alerta se apaga sola al terminar el registro. Pide tu aviso: link en la bio.

## Para publicarlo

- **Música:** el video ya trae música y efectos propios. Si prefieres una canción de moda, súbelo y
  baja el volumen del sonido original desde la app de TikTok o Instagram.
- **Portada:** `out/portada-gancho.png` (la pregunta) o `out/portada-logo.png` (el logo).
- **Zonas seguras:** el texto importante queda fuera de la franja de arriba y de abajo, donde las
  apps ponen sus botones y la descripción.
- **Texto sugerido:** "¿Te tocó materia llena? ¿Hay Cupo? te avisa gratis cuando alguien la da de
  baja. Correo, Telegram o notificación. Link en la bio. #UdeG #SIIAU #CUCEI #registro
  #universidad". Proyecto independiente: no uses el escudo ni los colores de la UdeG.
