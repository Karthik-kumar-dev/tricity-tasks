#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("\n🧹 Purging load test records from Supabase...");

  // Count existing load test records
  const { count, error: countErr } = await supabase
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .like("team_id", "TRI_LOADTEST_%");

  if (countErr) {
    console.error("❌ Error querying submissions:", countErr.message);
    process.exit(1);
  }

  console.log(`Found ${count ?? 0} load test submission(s) matching 'TRI_LOADTEST_%'`);

  if ((count ?? 0) === 0) {
    console.log("✅ Database is already clean. Nothing to delete.\n");
    return;
  }

  const { error: deleteErr } = await supabase
    .from("submissions")
    .delete()
    .like("team_id", "TRI_LOADTEST_%");

  if (deleteErr) {
    console.error("❌ Failed to delete records:", deleteErr.message);
    process.exit(1);
  }

  console.log(`✅ Successfully deleted ${count} load test submissions.\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
