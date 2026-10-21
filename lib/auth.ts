// One shared password, checked once, then a signed cookie. Edge-safe (Web Crypto).

export const COOKIE = "hx_session";

async function hmac(value: string) {
  const secret = process.env.SESSION_SECRET ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSession() {
  const v = `ok.${Date.now()}`;
  return `${v}.${await hmac(v)}`;
}

export async function validSession(token: string | undefined) {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  return (await hmac(token.slice(0, i))) === token.slice(i + 1);
}
