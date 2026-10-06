import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Esta página no existe</h1>
      <p>
        <Link href="/" className="text-emerald-800 underline dark:text-emerald-300">
          Volver a buscar materias
        </Link>
      </p>
    </div>
  );
}
