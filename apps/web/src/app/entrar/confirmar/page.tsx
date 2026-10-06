import type { Metadata } from "next";

import { confirmLoginAction } from "@/app/actions";

export const metadata: Metadata = { title: "Confirmar entrada", robots: { index: false } };

/**
 * The magic link lands here, and only the button signs in. Some mail servers open every link
 * in a message to scan it; if opening the link signed in, the scanner would use it up.
 */
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/entrar/confirmar">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Ya casi</h1>
      <p className="text-stone-700 dark:text-stone-300">
        Confirma que eres tú para entrar a ¿Hay Cupo? en este dispositivo.
      </p>
      <form action={confirmLoginAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}
