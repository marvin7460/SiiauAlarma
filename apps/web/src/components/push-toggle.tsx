"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/actions";

type State =
  "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "working" | "error";

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** iPhone and iPad allow Web Push only to sites added to the home screen (iOS 16.4+). */
function needsHomeScreen(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !window.matchMedia("(display-mode: standalone)").matches
  );
}

async function currentState(): Promise<{ state: State; subscription: PushSubscription | null }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { state: needsHomeScreen() ? "ios-install" : "unsupported", subscription: null };
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) return { state: "on", subscription };
  return { state: Notification.permission === "denied" ? "denied" : "off", subscription: null };
}

const MESSAGES: Partial<Record<State, string>> = {
  unsupported: "Este navegador no permite notificaciones. Usa correo o Telegram.",
  "ios-install":
    "En iPhone: pulsa Compartir → «Agregar a pantalla de inicio», abre ¿Hay Cupo? desde ahí y vuelve a esta página.",
  denied:
    "Bloqueaste las notificaciones de este sitio. Puedes permitirlas en la configuración del navegador.",
  error: "No pudimos activar las notificaciones. Intenta de nuevo.",
};

const button =
  "rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:hover:bg-stone-800";

/** Turns browser notifications on or off for this device. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    currentState()
      .then(async ({ state: found, subscription }) => {
        // Browsers may renew a subscription on their own: saving it again keeps ours current.
        if (subscription) await savePushSubscriptionAction(subscription.toJSON());
        if (!cancelled) setState(found);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(publicKey),
      });
      if (!(await savePushSubscriptionAction(subscription.toJSON()))) {
        await subscription.unsubscribe();
        setState("error");
        return;
      }
      setState("on");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  async function disable() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  async function test() {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification("¿Hay Cupo?", {
      body: "Así se verán los avisos en este dispositivo.",
      icon: "/icon-192.png",
      tag: "prueba",
    });
  }

  return (
    <div className="space-y-2" aria-live="polite">
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Activadas en este dispositivo
          </span>
          <button type="button" className={button} onClick={() => void test()}>
            Probar
          </button>
          <button type="button" className={button} onClick={() => void disable()}>
            Desactivar
          </button>
        </div>
      ) : null}
      {state === "off" || state === "error" || state === "working" || state === "checking" ? (
        <button
          type="button"
          className={button}
          disabled={state === "working" || state === "checking"}
          onClick={() => void enable()}
        >
          {state === "working" ? "Un momento…" : "Activar en este dispositivo"}
        </button>
      ) : null}
      {MESSAGES[state] ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">{MESSAGES[state]}</p>
      ) : null}
    </div>
  );
}
