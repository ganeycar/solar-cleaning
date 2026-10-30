import { NextResponse } from "next/server";
import { suppressEmail } from "@/lib/email/suppress";

/** One-click unsubscribe (RFC 8058), used by Gmail/Apple Mail "Unsubscribe" buttons. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const ok = await suppressEmail(url.searchParams.get("e") ?? "", url.searchParams.get("t") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
