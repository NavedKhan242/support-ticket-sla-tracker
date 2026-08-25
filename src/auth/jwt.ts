import { UserRole } from "@prisma/client";

export interface TokenPayload {
  userId: string;
  role: UserRole;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-do-not-use-in-prod";

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString();
}

export function signToken(payload: TokenPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const completePayload = { ...payload, exp };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const hasher = new Bun.CryptoHasher("sha256", JWT_SECRET);
  hasher.update(data);
  const signature = base64UrlEncode(hasher.digest("latin1"));
  return `${data}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;
    const data = `${encodedHeader}.${encodedPayload}`;
    const hasher = new Bun.CryptoHasher("sha256", JWT_SECRET);
    hasher.update(data);
    const expectedSignature = base64UrlEncode(hasher.digest("latin1"));
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload & { exp: number };
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, role: payload.role, email: payload.email };
  } catch {
    return null;
  }
}
