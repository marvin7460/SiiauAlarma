import { connectTelegramAction, disconnectTelegramAction } from "@/app/actions";
import type { ChannelSettings } from "@/lib/channels";

import { PushToggle } from "./push-toggle";

const button =
  "rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800";

function Channel(props: { title: string; children: React.ReactNode }) {
  return (
    <li className="grid gap-2 py-3 sm:grid-cols-[10rem_1fr]">
      <h3 className="font-semibold">{props.title}</h3>
      <div className="space-y-2">{props.children}</div>
    </li>
  );
}

/** Where alerts can reach the student, and the buttons to set up Telegram and push. */
export function ChannelsPanel({ email, settings }: { email: string; settings: ChannelSettings }) {
  return (
    <section aria-labelledby="canales" className="space-y-2">
      <h2 id="canales" className="text-lg font-semibold">
        Cómo te avisamos
      </h2>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Cada alerta usa los canales que marques al crearla. Telegram y las notificaciones suelen
        llegar antes que el correo.
      </p>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white px-4 dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
        <Channel title="Correo">
          <p className="text-sm">{email}</p>
        </Channel>
        {settings.telegram.available ? (
          <Channel title="Telegram">
            {settings.telegram.linked ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Conectado
                </span>
                <form action={disconnectTelegramAction}>
                  <button type="submit" className={button}>
                    Desconectar
                  </button>
                </form>
              </div>
            ) : (
              <>
                <form action={connectTelegramAction}>
                  <button type="submit" className={button}>
                    Conectar Telegram
                  </button>
                </form>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  Se abre el chat con @{settings.telegram.botUsername}: pulsa «Iniciar» y listo. El
                  enlace dura 15 minutos.
                </p>
              </>
            )}
          </Channel>
        ) : null}
        {settings.push.available && settings.push.publicKey ? (
          <Channel title="Notificaciones">
            <PushToggle publicKey={settings.push.publicKey} />
            {settings.push.devices > 0 ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Dispositivos con notificaciones: {settings.push.devices}
              </p>
            ) : null}
          </Channel>
        ) : null}
      </ul>
    </section>
  );
}
