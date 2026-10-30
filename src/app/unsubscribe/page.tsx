import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui";
import { suppressEmail } from "@/lib/email/suppress";
import { verifyUnsubscribe } from "@/lib/email/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };
export const dynamic = "force-dynamic";

async function confirm(form: FormData) {
  "use server";
  const e = String(form.get("e") ?? "");
  const t = String(form.get("t") ?? "");
  const ok = await suppressEmail(e, t);
  redirect(ok ? "/unsubscribe?done=1" : `/unsubscribe?${new URLSearchParams({ e, t, failed: "1" })}`);
}

// A button (not the link itself) does the unsubscribe, so email scanners that
// open links can't unsubscribe people by accident.
export default async function Unsubscribe({ searchParams }: { searchParams: Promise<{ e?: string; t?: string; done?: string; failed?: string }> }) {
  const { e = "", t = "", done, failed } = await searchParams;
  const valid = e && t && verifyUnsubscribe(e, t);
  return (
    <Container className="max-w-xl py-16">
      <h1 className="text-3xl font-extrabold">Email preferences</h1>
      {done ? (
        <p className="mt-4 text-lg">You&apos;re unsubscribed from follow-up emails. You&apos;ll still get messages about appointments and payments you make.</p>
      ) : valid ? (
        <form action={confirm} className="mt-6 space-y-4">
          <input type="hidden" name="e" value={e} />
          <input type="hidden" name="t" value={t} />
          <p>Stop quote follow-up emails to <strong>{e}</strong>? You&apos;ll still get messages about appointments and payments.</p>
          {failed && <p className="text-sm text-red-700">Something went wrong. Please try again.</p>}
          <button className="rounded-full bg-navy px-6 py-3 font-semibold text-white">Unsubscribe</button>
        </form>
      ) : (
        <p className="mt-4">This unsubscribe link isn&apos;t valid. Reply to any of our emails and we&apos;ll take care of it.</p>
      )}
    </Container>
  );
}
