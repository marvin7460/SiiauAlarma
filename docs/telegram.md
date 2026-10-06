# Configurar el bot de Telegram

El bot es opcional: sin él, la app funciona solo con correo (y notificaciones del navegador si
configuras VAPID). Todo esto es gratis.

## 1. Crear el bot con @BotFather

1. En Telegram, abre [@BotFather](https://t.me/BotFather) y envía `/newbot`.
2. Nombre visible: por ejemplo `¿Hay Cupo?`.
3. Nombre de usuario: tiene que terminar en `bot`, por ejemplo `HayCupoUdGBot`.
4. BotFather te da un **token** como `123456789:AAH…`. Es una contraseña: quien lo tenga controla
   el bot. No lo subas al repositorio ni lo pegues en issues.

Opcional, en el mismo chat con BotFather:

- `/setuserpic`: el ícono (puedes usar `apps/web/public/icon-512.png`).
- `/setjoingroups` → **Disable**: el bot solo funciona en chats privados; así nadie lo agrega a
  grupos.
- `/setprivacy` → **Enable** (el valor por defecto).

## 2. Generar el secreto del webhook

Telegram enviará este secreto con cada mensaje, y el sitio rechaza las llamadas que no lo traen.

```sh
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## 3. Guardar las variables

Las tres variables van juntas (sin el usuario o sin el secreto, la app no arranca). En local,
en `.env.local` (en la raíz); en producción, en el `.env` de la VM, junto a `compose.yaml`.
Ambos archivos están en `.gitignore`.

```sh
TELEGRAM_BOT_TOKEN=123456789:AAH...
TELEGRAM_WEBHOOK_SECRET=el-secreto-del-paso-2
TELEGRAM_BOT_USERNAME=HayCupoUdGBot
```

En la VM, después de editar `.env`: `docker compose up -d` (recrea el contenedor con las
variables nuevas).

## 4. Conectar el webhook (producción)

Con el sitio ya desplegado (y las variables del paso 3 en tu `.env.local`, porque el script
corre en tu máquina):

```sh
pnpm --filter @haycupo/web telegram setup https://tu-dominio.com
```

El script:

- registra `https://tu-dominio.com/api/telegram/webhook` con el secreto (`setWebhook`), pidiendo
  solo mensajes;
- publica el menú de comandos (`/alertas`, `/desvincular`, `/ayuda`);
- pone la descripción del bot, con la aclaración de que no está afiliado a la UdeG;
- muestra `getWebhookInfo`. Si ves `last_error_message`, algo falla (por ejemplo, un 401 indica
  que el secreto no coincide con el del servidor).

Para revisarlo después: `pnpm --filter @haycupo/web telegram info`.

## 5. Probar en local

Telegram no puede llamar a `localhost`, así que en desarrollo el script hace de puente:

```sh
pnpm --filter @haycupo/web dev                    # terminal 1: el sitio en :3000
pnpm --filter @haycupo/web telegram dev           # terminal 2: el puente
```

El puente quita el webhook, lee los mensajes con _long polling_ (`getUpdates`) y se los pasa al
sitio local, como lo haría Telegram. Cuando termines, vuelve a correr `telegram setup` con la
URL de producción.

Prueba manual:

1. Entra a la web, ve a **Mis alertas** → **Conectar Telegram**.
2. Se abre el chat con el bot: pulsa **Iniciar**. Debe contestar "¡Listo!".
3. Recarga **Mis alertas**: Telegram aparece como "Conectado".
4. Crea una alerta con Telegram marcado y escribe `/alertas` al bot.
5. Con el SIIAU falso (`pnpm --filter @haycupo/fake-siiau start`), libera un lugar:
   ```sh
   curl -X POST localhost:8788/__fake/available \
     -d '{"cycle":"202620","center":"D","nrc":"78088","available":1}'
   ```
   y espera el siguiente sondeo, que corre cada minuto (o fuérzalo con
   `curl -X POST -H "Authorization: Bearer $INTERNAL_API_TOKEN" localhost:3000/api/internal/poll`).

## Cómo funciona

- El código de vinculación dura 15 minutos y se usa una vez; en la base solo está su SHA-256.
- Un chat pertenece a una sola cuenta: si se vincula a otra, se mueve.
- `/desvincular` (o "Desconectar" en la web) borra el `chat_id`. Si alguien bloquea el bot, el
  siguiente envío recibe un 403 y el chat se desvincula solo.
- Detalles y razones: [decisión 21](decisions.md#21-bot-de-telegram-por-webhook-con-la-respuesta-en-la-misma-llamada-fase-4).
