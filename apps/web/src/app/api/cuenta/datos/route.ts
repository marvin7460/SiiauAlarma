import { exportAccountData } from "@/lib/account";
import { getCurrentUser } from "@/lib/auth";

/** "Descargar mis datos": a JSON file with everything stored about the signed-in student. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Inicia sesión primero." }, { status: 401 });
  const data = await exportAccountData(user.id);
  if (!data) return Response.json({ error: "No encontramos tu cuenta." }, { status: 404 });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="hay-cupo-mis-datos.json"',
      "Cache-Control": "no-store",
    },
  });
}
