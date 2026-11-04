import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "pd_session";

/** The cookie holds a hash of the passcode, never the passcode. */
export function tokenFor(passcode: string): string {
  return createHmac("sha256", passcode).update("people-dashboard-v1").digest("hex");
}

export function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Only allow paths on this site after login. */
export function safeNext(next: unknown): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
