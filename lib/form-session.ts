import { env } from "cloudflare:workers";
const encoder = new TextEncoder();
export const cookieName = "dinner_session";
async function key() {
  if (!env.SESSION_SECRET) throw new Error("Session secret missing");
  return crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signSession(value: string) {
  const signature = await crypto.subtle.sign("HMAC", await key(), encoder.encode(value));
  return [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function readSession(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (!value) return null;
  const [id, expires, sig] = value.split(".");
  if (!id || !expires || !/^[0-9a-f]{64}$/.test(sig || "") || Number(expires) <= Date.now()) return null;
  const valid = await crypto.subtle.verify("HMAC", await key(), new Uint8Array(sig.match(/../g)!.map(x => parseInt(x, 16))), encoder.encode(`${id}.${expires}`));
  return valid ? id : null;
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
