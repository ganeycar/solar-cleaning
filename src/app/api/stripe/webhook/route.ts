import { NextResponse } from "next/server";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { getStripe } from "@/lib/stripe/client";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook endpoint. This is the ONLY place payments and subscriptions
 * are marked successful: the signature proves the event came from Stripe, and
 * each event id is processed once.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripeRes = getStripe();
  const db = getAdminClient();
  if (!secret || !stripeRes.ok || !db) {
    console.error("Stripe webhook not configured", { hasSecret: Boolean(secret), stripe: stripeRes.ok ? "ok" : stripeRes.reason, db: Boolean(db) });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const { stripe, live } = stripeRes;

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.warn("Rejected Stripe webhook with invalid signature", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.livemode && !live) {
    console.warn(`Ignored live-mode event ${event.id}: live payments are not approved.`);
    return NextResponse.json({ ignored: true });
  }

  // Duplicate protection: record the event id first; skip if already processed.
  const { error: insertError } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("Could not record Stripe event", insertError.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
    const { data: existing } = await db.from("stripe_events").select("processed_at").eq("id", event.id).maybeSingle();
    if (existing?.processed_at) return NextResponse.json({ duplicate: true });
    // Earlier attempt failed: process again (handlers are idempotent).
  }

  try {
    await handleStripeEvent(stripe, db, event);
    await db.from("stripe_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error(`Stripe event ${event.id} (${event.type}) failed:`, message);
    await db.from("stripe_events").update({ error: message.slice(0, 1000) }).eq("id", event.id);
    // Non-2xx tells Stripe to retry later.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
