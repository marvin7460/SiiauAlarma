/**
 * pnpm --filter @haycupo/notify vapid
 *
 * Prints a new VAPID key pair for Web Push. The public key goes to apps/web
 * (VAPID_PUBLIC_KEY); both keys go to apps/worker. Keep the private key secret.
 */
import { generateVapidKeys } from "../src/vapid-keys";

const keys = await generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
