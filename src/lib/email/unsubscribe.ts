import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed unsubscribe links: nobody can unsubscribe someone else's address. */

function secret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || process.env.RATE_LIMIT_SALT?.trim() || null;
}

export function unsubscribeToken(email: string, key = secret()): string | null {
  if (!key) return null;
  return createHmac("sha256", key).update(`unsubscribe:${email.trim().toLowerCase()}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string, key = secret()): boolean {
  const expected = unsubscribeToken(email, key);
  if (!expected || typeof token !== "string" || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function unsubscribeUrl(siteUrl: string, email: string): string {
  const t = unsubscribeToken(email);
  return `${siteUrl}/unsubscribe?${new URLSearchParams({ e: email.trim().toLowerCase(), t: t ?? "" }).toString()}`;
}
