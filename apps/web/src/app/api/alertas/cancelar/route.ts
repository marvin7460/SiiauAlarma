import { cancelAlertWithSignature } from "@/lib/alerts";

/**
 * One-click unsubscribe (RFC 8058). Mail clients POST here when the student presses the
 * "unsubscribe" button they show for our List-Unsubscribe header. The signature is the proof.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const ok = await cancelAlertWithSignature(
    url.searchParams.get("alerta") ?? "",
    url.searchParams.get("firma") ?? "",
  );
  return new Response(ok ? "Alerta cancelada" : "Enlace no válido", { status: ok ? 200 : 400 });
}
