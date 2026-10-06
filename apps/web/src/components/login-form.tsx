"use client";

import { useActionState } from "react";

import { requestLoginAction, type LoginState } from "@/app/actions";

/** Email field that sends a magic link. Works without JavaScript too (it is a form action). */
export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginAction, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div
        role="status"
        className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      >
        <p className="font-semibold">Revisa tu correo</p>
        <p className="mt-1 text-sm">
          Te enviamos un enlace a <strong>{state.message}</strong>. Vence en 15 minutos. Si no
          llega, revisa la carpeta de spam.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="grid gap-1 text-sm font-medium">
        Tu correo
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="tu.nombre@alumnos.udg.mx"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
        />
      </label>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviarme un enlace para entrar"}
      </button>
      <p className="text-xs text-stone-600 dark:text-stone-400">
        Sin contraseñas: te mandamos un enlace de un solo uso. Solo guardamos tu correo, para
        avisarte. Nunca te pediremos tu contraseña de SIIAU.
      </p>
    </form>
  );
}
