/**
 * Email content. Pure functions (no I/O) so every message can be unit-tested.
 * Each returns a subject, simple branded HTML, and a plain-text version.
 * Never include prices or claims that aren't in the data passed in.
 */

export interface Brand {
  businessName: string;
  phone: string | null;
  email: string | null;
  navy: string;
  gold: string;
  siteUrl: string;
  reviewUrl: string | null;
  mailingAddress: string | null;
}

export interface Email {
  subject: string;
  html: string;
  text: string;
  /** Optional emails honor unsubscribes and carry an unsubscribe link. */
  optional?: boolean;
}

export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const TZ = "America/Los_Angeles";
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
export function formatDay(isoOrDate: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" }).format(d);
}
export function money(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

type Block =
  | { p: string }
  | { list: string[] }
  | { button: { label: string; href: string } }
  | { note: string }
  | { box: string[] };

/** Builds HTML + text from simple blocks. All strings are escaped here. */
function render(brand: Brand, heading: string, greeting: string | null, blocks: Block[], footer: { unsubscribeUrl?: string } = {}): { html: string; text: string } {
  const html: string[] = [];
  const text: string[] = [];
  if (greeting) { html.push(`<p style="margin:0 0 16px">${esc(greeting)}</p>`); text.push(greeting, ""); }
  for (const b of blocks) {
    if ("p" in b) { html.push(`<p style="margin:0 0 16px;line-height:1.5">${esc(b.p)}</p>`); text.push(b.p, ""); }
    else if ("note" in b) { html.push(`<p style="margin:0 0 16px;font-size:13px;color:#5b6573;line-height:1.5">${esc(b.note)}</p>`); text.push(b.note, ""); }
    else if ("list" in b) {
      html.push(`<ul style="margin:0 0 16px;padding-left:20px;line-height:1.6">${b.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
      text.push(...b.list.map((i) => `- ${i}`), "");
    } else if ("box" in b) {
      html.push(`<div style="margin:0 0 16px;padding:14px 16px;border-radius:10px;background:#f5f3ee;line-height:1.6">${b.box.map((l) => esc(l)).join("<br>")}</div>`);
      text.push(...b.box, "");
    } else if ("button" in b) {
      html.push(`<p style="margin:8px 0 24px"><a href="${esc(b.button.href)}" style="display:inline-block;background:${esc(brand.gold)};color:${esc(brand.navy)};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px">${esc(b.button.label)}</a></p>`);
      text.push(`${b.button.label}: ${b.button.href}`, "");
    }
  }
  const contact = [brand.phone, brand.email].filter(Boolean).join(" · ");
  const footerLines = [brand.businessName, contact, brand.mailingAddress].filter((x): x is string => Boolean(x));
  const unsub = footer.unsubscribeUrl
    ? `<br><a href="${esc(footer.unsubscribeUrl)}" style="color:#5b6573">Unsubscribe from follow-up emails</a>`
    : "";
  const page = `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Helvetica,Arial,sans-serif;color:#1f2933">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${esc(brand.navy)};color:#ffffff;padding:18px 24px;font-weight:800;font-size:18px">${esc(brand.businessName)}</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:22px;color:${esc(brand.navy)}">${esc(heading)}</h1>${html.join("\n")}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e6e2d8;font-size:12px;color:#5b6573;line-height:1.5">${footerLines.map(esc).join("<br>")}${unsub}</td></tr>
</table></td></tr></table></body></html>`;
  const plain = [heading, "", ...text, "--", ...footerLines, ...(footer.unsubscribeUrl ? [`Unsubscribe from follow-up emails: ${footer.unsubscribeUrl}`] : [])].join("\n");
  return { html: page, text: plain };
}

const hi = (name: string | null | undefined) => (name ? `Hi ${name},` : "Hi,");
const ref = (id: string) => String(id).slice(0, 8).toUpperCase();

// ---------------------------------------------------------------- Quotes

export function quoteReceived(brand: Brand, q: { id: string; firstName: string; status: string; priceCents: number | null; address: string }): Email {
  const priced = q.status === "quoted" && q.priceCents != null;
  const blocks: Block[] = [
    { p: `Thanks for requesting a solar panel cleaning quote for ${q.address}. Your reference is ${ref(q.id)}.` },
    priced
      ? { box: [`Your price: ${money(q.priceCents!)}`, "Sign in with this email address to book a time that works for you."] }
      : q.status === "out_of_area"
        ? { p: "That address is outside the area we currently serve. We'll keep your request on file and let you know if that changes." }
        : q.status === "waitlist"
          ? { p: "We're not taking new customers in your city just yet. You're on the waitlist, and we'll reach out as soon as a spot opens." }
          : { p: "We'll review the details (roof, access, and panel count) and follow up with an exact price, usually within one business day." },
  ];
  if (priced) blocks.push({ button: { label: "Sign in and book", href: `${brand.siteUrl}/dashboard` } });
  blocks.push({ note: "You'll sign in with a one-time link sent to this email. No password needed." });
  return { subject: priced ? `Your solar panel cleaning quote: ${money(q.priceCents!)}` : "We received your quote request", ...render(brand, "Thanks for your request", hi(q.firstName), blocks) };
}

export function ownerNewQuote(brand: Brand, q: { id: string; name: string; email: string; phone: string; address: string; panels: number; stories: number; status: string; reasons: string[]; priceCents: number | null }): Email {
  const status: Record<string, string> = { quoted: "Auto-priced", needs_review: "Needs your review", new: "Saved (prices not published)", out_of_area: "Out of area", waitlist: "Waitlist" };
  return {
    subject: `New quote request: ${q.name}, ${q.panels} panels (${status[q.status] ?? q.status})`,
    ...render(brand, "New quote request", null, [
      { box: [q.name, q.email, q.phone, q.address, `${q.panels} panels · ${q.stories} ${q.stories === 1 ? "story" : "stories"}`, `Status: ${status[q.status] ?? q.status}${q.priceCents != null ? ` · ${money(q.priceCents)}` : ""}`] },
      ...(q.reasons.length ? [{ list: q.reasons } as Block] : []),
      { button: { label: "Open in owner tools", href: `${brand.siteUrl}/admin/quotes` } },
    ]),
  };
}

/** Follow-up for a priced quote that hasn't been booked. `n` is 1 or 2. */
export function quoteFollowUp(brand: Brand, q: { id: string; firstName: string; priceCents: number; n: number }, unsubscribeUrl: string): Email {
  const first = q.n === 1;
  return {
    optional: true,
    subject: first ? "Your solar panel cleaning quote is ready to book" : "Still want your panels cleaned?",
    ...render(brand, first ? "Ready when you are" : "Checking in one last time", hi(q.firstName), [
      { p: first
        ? `Your quote (${ref(q.id)}) is ${money(q.priceCents)}. You can pick a day and arrival time online in about a minute.`
        : `Your quote (${ref(q.id)}) for ${money(q.priceCents)} is still available. If now isn't a good time, no problem. This is the last reminder we'll send about it.` },
      { button: { label: "See your quote and book", href: `${brand.siteUrl}/dashboard` } },
      { note: "Questions about your roof or access? Just reply to this email." },
    ], { unsubscribeUrl }),
  };
}

// ---------------------------------------------------------------- Purchases

export function oneTimeConfirmation(brand: Brand, d: { firstName: string | null; amountCents: number; validUntil: string }): Email {
  return {
    subject: "Payment received: your cleaning is ready to schedule",
    ...render(brand, "You're all set", hi(d.firstName), [
      { p: `We received your payment of ${money(d.amountCents)} for a one-time solar panel cleaning.` },
      { p: `Your cleaning is in your account and can be scheduled any time before ${formatDay(d.validUntil)}.` },
      { button: { label: "Schedule your cleaning", href: `${brand.siteUrl}/schedule` } },
      { note: "Stripe processes payments. Your receipt is available from your dashboard under Billing." },
    ]),
  };
}

/**
 * California automatic renewal law: after a membership starts, the customer
 * gets an acknowledgment they can keep with the renewal terms, the
 * cancellation policy, and how to cancel. `disclosure` is the exact text they
 * agreed to at checkout.
 */
export function membershipAcknowledgment(brand: Brand, d: { firstName: string | null; planName: string; amountCents: number; interval: string; disclosure: string | null; consentAt: string | null; renewsOn: string | null }): Email {
  const per = d.interval === "year" ? "year" : "month";
  return {
    subject: `Welcome to ${d.planName}: your membership details`,
    ...render(brand, `Welcome to ${d.planName}`, hi(d.firstName), [
      { p: "Thanks for joining. Please keep this email: it confirms the terms of your membership." },
      { box: [
        `Plan: ${d.planName}`,
        `Price: ${money(d.amountCents)} per ${per}, charged automatically until you cancel`,
        ...(d.renewsOn ? [`Next charge: ${formatDay(d.renewsOn)}`] : []),
        ...(d.consentAt ? [`You agreed to these terms on ${formatDay(d.consentAt)}`] : []),
      ] },
      ...(d.disclosure ? [{ p: `Terms you agreed to: ${d.disclosure}` } as Block] : []),
      { p: "How to cancel: sign in, open your dashboard, and choose \"Change plan or cancel\". You can cancel online at any time, and your membership stays active until the end of the period you've paid for. You can also reply to this email to cancel." },
      { p: per === "month"
        ? "Your cleanings unlock through the year as monthly payments are made. Each cleaning is valid until the end of your membership year."
        : "Your cleanings for the year are in your account now and are valid until the end of your membership year." },
      { button: { label: "Schedule a cleaning", href: `${brand.siteUrl}/schedule` } },
    ]),
  };
}

export function paymentFailed(brand: Brand, d: { firstName: string | null; amountCents: number; planName: string | null }): Email {
  return {
    subject: "Action needed: your membership payment didn't go through",
    ...render(brand, "Payment didn't go through", hi(d.firstName), [
      { p: `We couldn't process your ${d.planName ? `${d.planName} ` : ""}payment of ${money(d.amountCents)}. Your card may have expired or been declined.` },
      { p: "Please update your payment method. Stripe will try again automatically, and new cleanings unlock once a payment succeeds." },
      { button: { label: "Update payment method", href: `${brand.siteUrl}/dashboard` } },
      { note: "On your dashboard, choose \"Manage billing & receipts\"." },
    ]),
  };
}

export function ownerPaymentFailed(brand: Brand, d: { customer: string; amountCents: number; customerId: string }): Email {
  return {
    subject: `Payment failed: ${d.customer} (${money(d.amountCents)})`,
    ...render(brand, "A membership payment failed", null, [
      { p: `${d.customer}'s payment of ${money(d.amountCents)} failed. They've been emailed a link to update their card. Stripe retries automatically.` },
      { button: { label: "Open customer", href: `${brand.siteUrl}/admin/customers/${d.customerId}` } },
    ]),
  };
}

// ---------------------------------------------------------------- Appointments

export interface BookingInfo { id: string; firstName: string | null; start: string; address: string; customerName?: string }

const PREP = [
  "Unlock any gate and keep pets inside during the visit.",
  "We use an outdoor water spigot. Please make sure it's on and reachable.",
  "No need to be home if we can reach the panels and the spigot.",
];

export function bookingConfirmed(brand: Brand, b: BookingInfo, kind: "booked" | "rescheduled"): Email {
  return {
    subject: kind === "booked" ? `Booked: solar panel cleaning on ${formatWhen(b.start)}` : `New time: solar panel cleaning on ${formatWhen(b.start)}`,
    ...render(brand, kind === "booked" ? "Your cleaning is booked" : "Your appointment has moved", hi(b.firstName), [
      { box: [`Arrival: ${formatWhen(b.start)} (Pacific)`, b.address] },
      { list: PREP },
      { button: { label: "View or change your appointment", href: `${brand.siteUrl}/dashboard` } },
      { note: "You can reschedule or cancel online up to the cutoff shown on your dashboard. We'll send a reminder the day before." },
    ]),
  };
}

export function bookingReminder(brand: Brand, b: BookingInfo): Email {
  return {
    subject: `Reminder: solar panel cleaning tomorrow, ${formatWhen(b.start)}`,
    ...render(brand, "See you tomorrow", hi(b.firstName), [
      { box: [`Arrival: ${formatWhen(b.start)} (Pacific)`, b.address] },
      { list: PREP },
      { p: "If it's raining or windy, we'll contact you to reschedule. Your cleaning won't be used." },
      { button: { label: "View your appointment", href: `${brand.siteUrl}/dashboard` } },
    ]),
  };
}

export function bookingCanceled(brand: Brand, b: BookingInfo, reason: "customer" | "weather" | "safety" | "no_access"): Email {
  const body: Record<typeof reason, string> = {
    customer: "Your appointment has been canceled. The cleaning is back in your account, so you can book a new time whenever you're ready.",
    weather: "We've canceled this appointment because of weather. Your cleaning is back in your account; please pick a new time.",
    safety: "Our technician had to stop because conditions weren't safe to clean. Your cleaning is back in your account; please pick a new time. We'll contact you if anything needs your attention first.",
    no_access: "Our technician wasn't able to reach your panels or water at the appointment time, so the visit counts as used under our access policy. Please reply to this email if you think this is a mistake.",
  };
  return {
    subject: reason === "no_access" ? "We couldn't access your property today" : `Canceled: your appointment on ${formatWhen(b.start)}`,
    ...render(brand, reason === "no_access" ? "We missed you today" : "Appointment canceled", hi(b.firstName), [
      { box: [`Was scheduled: ${formatWhen(b.start)}`, b.address] },
      { p: body[reason] },
      { button: { label: reason === "no_access" ? "Go to your dashboard" : "Pick a new time", href: `${brand.siteUrl}/${reason === "no_access" ? "dashboard" : "schedule"}` } },
    ]),
  };
}

export function ownerBookingEvent(brand: Brand, b: BookingInfo, what: string): Email {
  return {
    subject: `${what}: ${b.customerName ?? "customer"}, ${formatWhen(b.start)}`,
    ...render(brand, what, null, [
      { box: [b.customerName ?? "", `${formatWhen(b.start)} (Pacific)`, b.address] },
      { button: { label: "Open schedule", href: `${brand.siteUrl}/admin/schedule` } },
    ]),
  };
}

export function jobCompleted(brand: Brand, b: BookingInfo & { damage: boolean }): Email {
  const blocks: Block[] = [
    { p: `Your solar panels at ${b.address} were cleaned today. Before-and-after photos and the technician's notes are in your service report.` },
    { button: { label: "View photos and report", href: `${brand.siteUrl}/dashboard/reports/${b.id}` } },
  ];
  if (b.damage) blocks.push({ p: "Our technician noted something on your system worth a look. Details and photos are in the report. We clean panels only, so for repairs or performance questions please contact your solar installer." });
  if (brand.reviewUrl) {
    blocks.push({ p: "If you were happy with the cleaning, a quick review helps your neighbors find us and means a lot to a small local business." });
    blocks.push({ button: { label: "Leave a review", href: brand.reviewUrl } });
  }
  return { subject: "Your panels are clean: photos and report inside", ...render(brand, "All done!", hi(b.firstName), blocks) };
}

// ---------------------------------------------------------------- Membership notices

/** Yearly members: required notice before an annual renewal charge. */
export function renewalNotice(brand: Brand, d: { firstName: string | null; planName: string; amountCents: number; renewsOn: string }): Email {
  return {
    subject: `Your ${d.planName} membership renews on ${formatDay(d.renewsOn)}`,
    ...render(brand, "Upcoming renewal", hi(d.firstName), [
      { p: `Your ${d.planName} membership will renew automatically on ${formatDay(d.renewsOn)}, and your card on file will be charged ${money(d.amountCents)} for another year.` },
      { p: "Nothing to do if you'd like to continue. To cancel, sign in and choose \"Change plan or cancel\" on your dashboard before the renewal date. You can also reply to this email." },
      { button: { label: "Manage your membership", href: `${brand.siteUrl}/dashboard` } },
    ]),
  };
}

/** Monthly members: yearly reminder of the membership terms and how to cancel. */
export function annualReminder(brand: Brand, d: { firstName: string | null; planName: string; amountCents: number; interval: string }): Email {
  return {
    subject: `A yearly reminder about your ${d.planName} membership`,
    ...render(brand, "Your membership at a glance", hi(d.firstName), [
      { p: `You're a ${d.planName} member at ${money(d.amountCents)} per ${d.interval === "year" ? "year" : "month"}, charged automatically until you cancel.` },
      { p: "To cancel, sign in and choose \"Change plan or cancel\" on your dashboard, or reply to this email." },
      { button: { label: "Manage your membership", href: `${brand.siteUrl}/dashboard` } },
    ]),
  };
}

export function cleaningsExpiring(brand: Brand, d: { firstName: string | null; count: number; validUntil: string }): Email {
  return {
    subject: `${d.count === 1 ? "Your cleaning expires" : `${d.count} cleanings expire`} on ${formatDay(d.validUntil)}`,
    ...render(brand, "Don't miss your cleaning", hi(d.firstName), [
      { p: `You have ${d.count === 1 ? "a cleaning" : `${d.count} cleanings`} in your account that ${d.count === 1 ? "needs" : "need"} to be scheduled by ${formatDay(d.validUntil)}.` },
      { button: { label: "Schedule now", href: `${brand.siteUrl}/schedule` } },
    ]),
  };
}
