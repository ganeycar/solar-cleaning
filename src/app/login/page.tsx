import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/account-forms";
import { Container, PageHero } from "@/components/ui";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer Login", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <>
      <PageHero eyebrow="Customer portal" title="Sign in or create an account" intro="See your quotes, appointments, cleanings remaining, and before-and-after photos in one place." />
      <Container className="max-w-md py-14">
        {error === "link" && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            That sign-in link is invalid or has expired. Links work once, on the same device and browser where you requested them. Please request a new one.
          </div>
        )}
        <LoginForm />
      </Container>
    </>
  );
}
