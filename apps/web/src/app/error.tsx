"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="space-y-4">
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p>No es tu culpa. Intenta de nuevo en un momento.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
      >
        Reintentar
      </button>
    </div>
  );
}
