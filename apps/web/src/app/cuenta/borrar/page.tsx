import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { deleteAccountAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Borrar mi cuenta" };

export default async function DeleteAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/entrar?next=/cuenta/borrar");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Borrar mi cuenta</h1>
      <p className="text-stone-700 dark:text-stone-300">
        Se borran de inmediato tu correo ({user.email}), tus alertas, el registro de avisos que te
        enviamos, la conexión con Telegram y las notificaciones de tus dispositivos. No se puede
        deshacer.
      </p>
      <p className="text-stone-700 dark:text-stone-300">
        Solo quedan los conteos diarios de la página de{" "}
        <Link href="/impacto" className="underline">
          impacto
        </Link>{" "}
        (por ejemplo, «ese día se enviaron 40 avisos»), que no dicen nada de ti.
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-400">
        Si quieres una copia antes,{" "}
        <a href="/api/cuenta/datos" className="underline">
          descarga tus datos
        </a>
        .
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <form action={deleteAccountAction}>
          <button
            type="submit"
            className="rounded-lg bg-rose-700 px-4 py-2 font-semibold text-white hover:bg-rose-800"
          >
            Sí, borrar mi cuenta
          </button>
        </form>
        <Link href="/alertas" className="underline">
          No, volver
        </Link>
      </div>
    </div>
  );
}
