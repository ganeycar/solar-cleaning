/**
 * Launch readiness checks for the owner's Launch page. Pure: takes the
 * environment and a few database facts, returns a checklist. Never returns
 * secret values, only whether they're set.
 */

export type CheckState = "ok" | "todo" | "warn" | "manual";
export interface Check { id: string; group: string; label: string; state: CheckState; detail: string }

export interface LaunchFacts {
  env: Record<string, string | undefined>;
  publishedPrices: number;
  pricingRulesPublished: boolean;
  activeTechnicians: number;
  business: { phone: string | null; email: string | null; mailingAddress: string | null; reviewUrl: string | null; licenseVerified: boolean; insuranceVerified: boolean };
  lastWebhookAt: string | null;
  failedWebhooks: number;
  lastDailyRunAt: string | null;
  lastDailyError: string | null;
  failedEmails7d: number;
  now: Date;
}

const set = (v: string | undefined) => Boolean(v && v.trim());

export function launchChecks(f: LaunchFacts): Check[] {
  const e = f.env;
  const site = e.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  const secret = e.STRIPE_SECRET_KEY?.trim() ?? "";
  const liveKey = secret.startsWith("sk_live_") || secret.startsWith("rk_live_");
  const liveApproved = e.STRIPE_LIVE_MODE_APPROVED === "true";
  const from = e.EMAIL_FROM?.trim() ?? "";
  const ownDomainSender = set(from) && !from.includes("resend.dev");
  const hoursSince = (iso: string | null) => (iso ? (f.now.getTime() - new Date(iso).getTime()) / 3600_000 : Infinity);
  const c: Check[] = [];
  const add = (group: string, id: string, label: string, state: CheckState, detail: string) => c.push({ id, group, label, state, detail });

  // Website
  add("Website", "site_url", "Website address", site.startsWith("https://") && !site.includes("localhost") ? "ok" : "todo",
    site.startsWith("https://") && !site.includes("localhost") ? site : "Set NEXT_PUBLIC_SITE_URL to your real https:// address when deploying.");
  add("Website", "indexable", "Visible to Google", e.NEXT_PUBLIC_SITE_INDEXABLE === "true" ? "ok" : "todo",
    e.NEXT_PUBLIC_SITE_INDEXABLE === "true" ? "Search engines may index the site." : "Set NEXT_PUBLIC_SITE_INDEXABLE=true on launch day (keeps the test site out of Google until then).");
  add("Website", "database", "Database connected", set(e.NEXT_PUBLIC_SUPABASE_URL) && set(e.SUPABASE_SERVICE_ROLE_KEY) ? "ok" : "todo", "Supabase URL and service key.");

  // Payments
  add("Payments", "stripe_keys", "Stripe connected", set(secret) && set(e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) ? "ok" : "todo", liveKey ? "Live keys." : set(secret) ? "Test keys (no real charges)." : "Add Stripe keys.");
  add("Payments", "stripe_live", "Live payments approved", liveKey && liveApproved ? "ok" : "manual",
    liveKey && liveApproved ? "Real cards are being charged." : "Test mode. Switch to live keys and STRIPE_LIVE_MODE_APPROVED=true only when you approve launch.");
  add("Payments", "webhook", "Payment confirmations (webhook)", !set(e.STRIPE_WEBHOOK_SECRET) ? "todo" : f.failedWebhooks > 0 ? "warn" : "ok",
    !set(e.STRIPE_WEBHOOK_SECRET) ? "Add STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint." : f.failedWebhooks > 0 ? `${f.failedWebhooks} payment event(s) failed. Retry them on the Quotes page.` : f.lastWebhookAt ? "Receiving events." : "Set up; no events received yet.");
  add("Payments", "prices", "Prices published", f.publishedPrices > 0 && f.pricingRulesPublished ? "ok" : "todo",
    `${f.publishedPrices} plan price(s) published; quote pricing ${f.pricingRulesPublished ? "published" : "not published"}.`);

  // Email
  add("Email", "resend", "Email sending", set(e.RESEND_API_KEY) ? (f.failedEmails7d > 0 ? "warn" : "ok") : "todo",
    !set(e.RESEND_API_KEY) ? "Add RESEND_API_KEY. Until then emails are logged but not sent." : f.failedEmails7d > 0 ? `${f.failedEmails7d} email(s) failed in the last 7 days. See Leads & emails.` : "Resend connected.");
  add("Email", "sender", "Sending from your own domain", ownDomainSender ? "ok" : "todo",
    ownDomainSender ? from : "Verify your domain in Resend and set EMAIL_FROM, e.g. \"Your Business <hello@yourdomain.com>\". The test sender only reaches your own inbox.");
  add("Email", "test_mode", "Emails go to customers", set(e.EMAIL_TEST_TO) ? "todo" : "ok",
    set(e.EMAIL_TEST_TO) ? "Test mode: every email goes to EMAIL_TEST_TO. Remove it at launch." : "Emails go to each customer.");
  add("Email", "owner_alerts", "Owner alerts", set(e.OWNER_NOTIFY_EMAIL) || set(f.business.email ?? undefined) ? "ok" : "todo", "New quotes, failed payments, and job issues go to OWNER_NOTIFY_EMAIL (or your business email).");
  add("Email", "mailing_address", "Mailing address in emails", f.business.mailingAddress ? "ok" : "todo", "Required in follow-up emails (CAN-SPAM). Set it on the Business page; a PO box is fine.");
  add("Email", "login_email", "Sign-in emails (Supabase SMTP)", "manual", "Supabase's built-in email only reaches your own team and is heavily rate-limited. Before launch, set Supabase → Authentication → SMTP to Resend so customers get sign-in links.");

  // Daily job
  add("Automation", "cron_secret", "Daily job secret", (e.CRON_SECRET?.trim().length ?? 0) >= 16 ? "ok" : "todo", "Set CRON_SECRET (16+ random characters) in Vercel so only Vercel can run the daily job.");
  const h = hoursSince(f.lastDailyRunAt);
  add("Automation", "cron_ran", "Daily job running", h <= 26 && !f.lastDailyError ? "ok" : h <= 26 ? "warn" : "todo",
    f.lastDailyRunAt ? (f.lastDailyError ? `Last run had errors: ${f.lastDailyError.slice(0, 160)}` : h <= 26 ? "Ran in the last day." : "Hasn't run in over a day.") : "Hasn't run yet. It runs automatically each morning once deployed; you can run it now below.");

  // Operations
  add("Business", "technician", "A technician is set up", f.activeTechnicians > 0 ? "ok" : "todo", f.activeTechnicians > 0 ? `${f.activeTechnicians} active.` : "Customers can't book until a technician exists (Schedule page).");
  add("Business", "contact", "Phone and email on the site", f.business.phone && f.business.email ? "ok" : "todo", "Set them on the Business page.");
  add("Business", "review_url", "Google review link", f.business.reviewUrl ? "ok" : "todo", "After your Google Business Profile is live, add its review link on the Business page.");
  add("Business", "insurance", "Insurance confirmed", f.business.insuranceVerified ? "ok" : "manual", "Get general liability insurance before working on customers' property, then enter and confirm it on the Business page.");
  add("Business", "license", "Business license confirmed", f.business.licenseVerified ? "ok" : "manual", "City of Vacaville business license (and a fictitious business name filing for your business name).");
  add("Business", "legal_review", "Legal pages reviewed", "manual", "Have a California attorney review the Terms, Privacy, and Membership Terms pages, then remove the draft notices.");
  add("Business", "google_profile", "Google Business Profile", "manual", "Create it as a service-area business with the same name, phone, and website.");

  return c;
}

export function readiness(checks: Check[]): { done: number; total: number } {
  const counted = checks.filter((c) => c.state !== "manual");
  return { done: counted.filter((c) => c.state === "ok").length, total: counted.length };
}
