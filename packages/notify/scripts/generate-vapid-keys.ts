/**
 * pnpm --filter @haycupo/notify vapid
 *
 * Prints a new VAPID key pair for Web Push. Both go in the server's .env; only the public one
 * ever reaches browsers. Keep the private key secret.
 */
import { generateVapidKeys } from "../src/vapid-keys";

const keys = await generateVapidKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
