// One-shot owner provisioning script.
// Usage: node scripts/create-owner.mjs <email> <password>
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
//
// The owner is the single top-level super-admin who oversees every branch.
// On most installs the Phase 2.7 migration already promoted the existing
// bootstrap admin to owner — this script is only for a clean install with no
// prior admin. It refuses to run if an owner already exists.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
  }
}

loadEnv();

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/create-owner.mjs <email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 0. Refuse if an owner already exists — there is exactly one.
const { count: ownerCount, error: countErr } = await supabase
  .from("users")
  .select("id", { count: "exact", head: true })
  .eq("role", "owner");

if (countErr) {
  console.error("owner check failed:", countErr.message);
  process.exit(1);
}
if ((ownerCount ?? 0) > 0) {
  console.error("An owner already exists — aborting. There is only one owner.");
  process.exit(1);
}

// 1. Create auth user with email auto-confirmed.
const { data: created, error: createErr } = await supabase.auth.admin.createUser(
  { email, password, email_confirm: true },
);

if (createErr) {
  console.error("createUser failed:", createErr.message);
  process.exit(1);
}

console.log(`auth user created: ${created.user.id}`);

// 2. Promote to owner. handle_new_auth_user created the public.users row
//    (role=employee, Main Branch); clear the branch — the owner has none.
const { error: updErr } = await supabase
  .from("users")
  .update({ role: "owner", branch_id: null })
  .eq("id", created.user.id);

if (updErr) {
  console.error("owner promotion failed:", updErr.message);
  process.exit(1);
}

console.log(`✓ ${email} is now the owner`);
