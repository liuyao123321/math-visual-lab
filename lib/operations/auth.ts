import type { OperationsConfig } from "./contract";

export const adminCookie = "mathlab_admin";
export const visitorCookie = "mathlab_visitor";
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, (value) => String.fromCharCode(value)).join("")).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
function decode(value: string) { return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0)); }
async function key(secret: string) { return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function signedToken(payload: { kind: "admin" | "visitor"; id: string; exp: number }, secret: string) {
  const body = encode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(body));
  return `${body}.${encode(new Uint8Array(signature))}`;
}
export async function readToken(token: string | undefined, kind: "admin" | "visitor", secret: string, now = Date.now()): Promise<string | null> {
  try {
    if (!token || token.length > 1024) return null;
    const [body, signature, extra] = token.split(".");
    if (extra || !signature || !await crypto.subtle.verify("HMAC", await key(secret), decode(signature), new TextEncoder().encode(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(decode(body)));
    return payload.kind === kind && typeof payload.id === "string" && typeof payload.exp === "number" && payload.exp > now ? payload.id : null;
  } catch { return null; }
}
export function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
}
export function cookieValue(name: string, value: string, seconds: number, request: Request) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function authorized(request: Request, config: OperationsConfig, now = Date.now()) {
  if (config.auth.mode === "platform") {
    const id = request.headers.get("oai-authenticated-user-id");
    return !!id && config.auth.userIds.includes(id);
  }
  return await readToken(readCookie(request, adminCookie), "admin", config.secret, now) === "admin";
}
export async function verifyPassword(password: string, stored: string) {
  try {
    const [algorithm, rounds, salt, expected] = stored.split("$");
    if (algorithm !== "pbkdf2" || Number(rounds) !== 210000 || password.length > 256) return false;
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decode(salt), iterations: Number(rounds), hash: "SHA-256" }, material, 256);
    const a = new Uint8Array(bits), b = decode(expected);
    if (a.length !== b.length) return false;
    let different = 0; for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
    return different === 0;
  } catch { return false; }
}
export async function opaqueId(value: string, secret: string) {
  return encode(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), new TextEncoder().encode(value))));
}
