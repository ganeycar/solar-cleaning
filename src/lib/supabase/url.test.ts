import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSupabaseUrl, supabaseEnv } from "./url.ts";

test("normalizes pasted Supabase URLs", () => {
  for (const raw of ["https://abc.supabase.co", "https://abc.supabase.co/", "https://abc.supabase.co/rest/v1/", " https://abc.supabase.co/rest/v1 "]) {
    assert.equal(normalizeSupabaseUrl(raw), "https://abc.supabase.co", raw);
  }
  assert.equal(normalizeSupabaseUrl(""), undefined);
  assert.equal(normalizeSupabaseUrl(undefined), undefined);
});

test("supabaseEnv requires both URL and anon key", () => {
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co/";
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal(supabaseEnv(), null);
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = " sb_publishable_x ";
  assert.deepEqual(supabaseEnv(), { url: "https://abc.supabase.co", anonKey: "sb_publishable_x" });
  if (saved.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
  if (saved.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
});
