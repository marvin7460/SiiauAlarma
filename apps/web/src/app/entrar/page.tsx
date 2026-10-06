import type { Metadata } from "next";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import { safeNext } from "@/lib/tokens";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignInPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  if (await getCurrentUser()) redirect(next as Route);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">Entrar</h1>
      {params.error === "enlace" ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          Ese enlace ya se usó o venció. Pide uno nuevo.
        </p>
      ) : null}
      <p className="text-stone-700 dark:text-stone-300">
        Para avisarte necesitamos tu correo. Escríbelo y te mandamos un enlace para entrar.
      </p>
      <LoginForm next={next} />
    </div>
  );
}
