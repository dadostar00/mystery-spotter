/**
 * Privacy by design (GDPR art. 25):
 *  - minimizzazione: il fact table riceve solo un token pseudonimo, mai email/telefono;
 *  - pseudonimizzazione: token = HMAC-SHA256(pepper segreto, contatto normalizzato),
 *    stabile per fare deduplica/conteggi senza conoscere il dato;
 *  - crypto-shredding: il dato in chiaro è cifrato AES-GCM con una chiave per-record;
 *    cancellare la chiave rende il dato irrecuperabile anche nei backup.
 * Usa solo Web Crypto: gira identico su browser, Node e Cloudflare Workers.
 */
const enc = new TextEncoder();

export const DEFAULT_RETENTION_DAYS = 30;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

/** JSON con chiavi ordinate: lo stesso contenuto produce sempre lo stesso hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalizzazione E.164 semplificata con prefisso italiano di default. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return `+39${digits}`;
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = normalizeEmail(email).split("@");
  // maschera a lunghezza fissa: non rivela nemmeno la lunghezza del dato
  return `${user.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  const n = normalizePhone(phone);
  return `${n.slice(0, 3)} ****${n.slice(-3)}`;
}

export async function pseudonymize(contact: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(contact));
  return `pii_${toHex(sig).slice(0, 24)}`;
}

export async function encryptPii(plain: unknown): Promise<{
  ciphertext: string;
  iv: string;
  jwk: JsonWebKey;
}> {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(JSON.stringify(plain)),
  );
  return { ciphertext: toB64(data), iv: toB64(iv), jwk: await crypto.subtle.exportKey("jwk", key) };
}

export async function decryptPii<T>(ciphertext: string, iv: string, jwk: JsonWebKey): Promise<T> {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, false, ["decrypt"]);
  const data = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) },
    key,
    fromB64(ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(data)) as T;
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}
