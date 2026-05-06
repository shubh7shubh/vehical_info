// One-shot admin provisioning script.
// Usage: node scripts/create-admin.mjs <email> <password>
// Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.

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
  console.error("Usage: node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 1. Create auth user with email auto-confirmed
const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (createErr) {
  console.error("createUser failed:", createErr.message);
  process.exit(1);
}

console.log(`auth user created: ${created.user.id}`);

// 2. Promote to admin (handle_new_auth_user trigger created the public.users row)
const { error: updErr } = await supabase
  .from("users")
  .update({ role: "admin" })
  .eq("id", created.user.id);

if (updErr) {
  console.error("role promotion failed:", updErr.message);
  process.exit(1);
}

console.log(`✓ ${email} is now an admin`);
