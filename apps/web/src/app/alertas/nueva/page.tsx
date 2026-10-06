import type { Metadata } from "next";
import { z } from "zod";

import { AlertForm } from "@/components/alert-form";
import { LoginForm } from "@/components/login-form";
import { Problem } from "@/components/problem";
import { getCurrentUser } from "@/lib/auth";
import { getChannelSettings } from "@/lib/channels";
import { WorkerError, searchOffer } from "@/lib/worker";

export const metadata: Metadata = { title: "Nueva alerta" };

const ParamsSchema = z.object({
  ciclo: z.string().regex(/^[0-9A-Z]{4,8}$/),
  centro: z.string().regex(/^[0-9A-Z]{1,2}$/),
  materia: z.string().regex(/^[A-Z0-9]{2,10}$/),
  tipo: z.enum(["section", "subject", "offer"]),
  nrc: z
    .string()
    .regex(/^\d{1,7}$/)
    .optional(),
  error: z.string().max(200).optional(),
});

export default async function NewAlertPage({ searchParams }: PageProps<"/alertas/nueva">) {
  const raw = await searchParams;
  const parsed = ParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return <Problem kind="invalid_query" />;
  }
  const params = parsed.data;
  const here = `/alertas/nueva?${new URLSearchParams({
    ciclo: params.ciclo,
    centro: params.centro,
    materia: params.materia,
    tipo: params.tipo,
    ...(params.nrc ? { nrc: params.nrc } : {}),
  }).toString()}`;

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-2xl font-bold">Para avisarte, entra con tu correo</h1>
        <p className="text-stone-700 dark:text-stone-300">
          Te mandamos un enlace; al abrirlo vuelves aquí para confirmar la alerta.
        </p>
        <LoginForm next={here} />
      </div>
    );
  }

  // The same cached search the results page used (it also lets the alert be validated).
  let result;
  try {
    result = await searchOffer({
      cycle: params.ciclo,
      center: params.centro,
      kind: "code",
      value: params.materia,
    });
  } catch (error) {
    if (error instanceof WorkerError) return <Problem kind={error.kind} />;
    throw error;
  }
  const section = params.nrc ? (result.sections.find((s) => s.nrc === params.nrc) ?? null) : null;
  const channels = await getChannelSettings(user.id);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Nueva alerta</h1>
      {params.error ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          {params.error}
        </p>
      ) : null}
      {params.tipo === "section" && !section ? (
        <Problem kind="invalid_query" />
      ) : (
        <AlertForm
          kind={params.tipo}
          cycle={params.ciclo}
          center={params.centro}
          subjectCode={params.materia}
          subjectName={result.sections[0]?.subjectName ?? null}
          section={section}
          backTo={here}
          channels={channels}
        />
      )}
      <p className="text-sm text-stone-600 dark:text-stone-400">El correo va a {user.email}.</p>
    </div>
  );
}
