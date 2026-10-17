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
```

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

- **Música:** el video no trae audio. Agrega una canción desde la app (TikTok o Instagram), así
  usa música con licencia y la plataforma lo muestra a más gente.
- **Portada:** `out/portada-gancho.png` (la pregunta) o `out/portada-logo.png` (el logo).
- **Zonas seguras:** el texto importante queda fuera de la franja de arriba y de abajo, donde las
  apps ponen sus botones y la descripción.
- **Texto sugerido:** "¿Te tocó materia llena? ¿Hay Cupo? te avisa gratis cuando alguien la da de
  baja. Correo, Telegram o notificación. Link en la bio. #UdeG #SIIAU #CUCEI #registro
  #universidad". Proyecto independiente: no uses el escudo ni los colores de la UdeG.
