import Link from "next/link";
import { requireStaff } from "@/lib/auth/staff";
import { getAdminClient } from "@/lib/supabase/admin";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });

export default async function AdminCustomers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q = "" } = await searchParams;
  const admin = getAdminClient();
  if (!admin) return <p className="text-muted">The Supabase service key isn&apos;t configured.</p>;

  // Strip characters that have meaning in search filters.
  const term = q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  let query = admin.from("profiles").select("id, first_name, last_name, email, phone, role, created_at").order("created_at", { ascending: false }).limit(100);
  if (term) query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data } = await query;
  const people = (data ?? []) as Row[];

  const ids = people.map((p) => p.id);
  const { data: subs } = ids.length ? await admin.from("subscriptions").select("customer_id, status").in("customer_id", ids) : { data: [] };
  const member = new Map<string, string>();
  for (const s of (subs ?? []) as Row[]) if (["active", "trialing", "past_due"].includes(s.status)) member.set(s.customer_id, s.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-extrabold">Customers</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name, email, or phone" className="field !w-72" aria-label="Search customers" />
          <button className="rounded-full bg-navy px-5 py-2 text-sm font-semibold text-white">Search</button>
        </form>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-muted">
            <tr><th className="p-3">Name</th><th>Email</th><th>Phone</th><th>Membership</th><th>Joined</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {people.map((p) => (
              <tr key={p.id} className="hover:bg-paper">
                <td className="p-3">
                  <Link href={`/admin/customers/${p.id}`} className="font-semibold text-navy underline">{[p.first_name, p.last_name].filter(Boolean).join(" ") || "(no name)"}</Link>
                  {p.role !== "customer" && <span className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs">{p.role}</span>}
                </td>
                <td>{p.email}</td>
                <td>{p.phone ?? "—"}</td>
                <td>{member.get(p.id) === "past_due" ? <span className="font-semibold text-red-700">Past due</span> : member.has(p.id) ? "Active" : "—"}</td>
                <td>{dateFmt.format(new Date(p.created_at))}</td>
              </tr>
            ))}
            {people.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted">No customers found.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Customers appear here after they create an account. Quote requests from people without accounts are on the Quotes page.</p>
    </div>
  );
}
