/**
 * Key generation for VAPID. Kept out of the package index on purpose: only the setup script and
 * tests need it, and it uses Node's WebCrypto types (the Worker never generates keys).
 */
function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** A new VAPID key pair: public key as an uncompressed P-256 point, private key as JWK `d`. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = await crypto.subtle.exportKey("raw", pair.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("Could not export the private key");
  return { publicKey: base64Url(publicKey), privateKey: jwk.d };
}
