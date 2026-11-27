import { createHmac, timingSafeEqual } from "node:crypto";
import { TenantRole } from "@prisma/client";

const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");

export type InviteClaims = {
  tenantId: string;
  email: string;
  role: TenantRole;
  jti: string;
  iat: number;
  exp: number;
  iss: "rechnify";
  aud: "tenant-invitation";
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 bytes to sign invites.");
  }
  return secret;
}

function signature(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest();
}

export function signInviteToken(
  input: Pick<InviteClaims, "tenantId" | "email" | "role" | "jti">,
) {
  const now = Math.floor(Date.now() / 1000);
  const claims: InviteClaims = {
    ...input,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
    iss: "rechnify",
    aud: "tenant-invitation",
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const unsigned = `${JWT_HEADER}.${payload}`;
  return { token: `${unsigned}.${signature(unsigned).toString("base64url")}`, claims };
}

export function verifyInviteToken(token: string): InviteClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, encodedSignature] = parts;
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;

    const expected = signature(`${header}.${payload}`);
    const actual = Buffer.from(encodedSignature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<InviteClaims>;
    const validRole = Object.values(TenantRole).includes(claims.role as TenantRole);
    if (
      typeof claims.tenantId !== "string" ||
      typeof claims.email !== "string" ||
      typeof claims.jti !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= Math.floor(Date.now() / 1000) ||
      claims.iss !== "rechnify" ||
      claims.aud !== "tenant-invitation" ||
      !validRole
    ) {
      return null;
    }

    return claims as InviteClaims;
  } catch {
    return null;
  }
}
