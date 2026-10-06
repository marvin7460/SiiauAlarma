import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Cuenta borrada" };

export default function AccountDeletedPage() {
  return (
    <div role="status" className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Listo: borramos tu cuenta</h1>
      <p className="text-stone-700 dark:text-stone-300">
        Tu correo, tus alertas y todo lo relacionado ya no están en ¿Hay Cupo?. Si algún día quieres
        volver, solo entra de nuevo con tu correo.
      </p>
      <Link href="/" className="underline">
        Ir al inicio
      </Link>
    </div>
  );
}
