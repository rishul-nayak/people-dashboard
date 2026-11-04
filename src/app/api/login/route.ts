import { NextResponse } from "next/server";
import { COOKIE, safeNext, same, tokenFor } from "@/lib/auth";

export async function POST(req: Request) {
  const passcode = process.env.PASSCODE;
  const body = await req.json().catch(() => ({}));
  const given = typeof body.passcode === "string" ? body.passcode : "";

  if (!passcode || !same(tokenFor(given), tokenFor(passcode))) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, next: safeNext(body.next) });
  res.cookies.set(COOKIE, tokenFor(passcode), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
