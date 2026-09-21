import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";
import { computeTeamScores } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Fetch submissions and registrations concurrently
  const [submissionsRes, registrationsRes] = await Promise.all([
    supabase
      .from("submissions")
      .select("team_id, member_name, member_name_normalized, college_name, task_id, score"),
    supabase
      .from("registrations")
      .select("registration_id, member_name"),
  ]);

  let submissions = submissionsRes.data;
  let error = submissionsRes.error;

  // Fallback if college_name column does not exist yet in Supabase
  if (error && (error.code === "42703" || error.message?.includes("college_name"))) {
    const retry = await supabase
      .from("submissions")
      .select("team_id, member_name, member_name_normalized, task_id, score");
    submissions = (retry.data || []).map((s) => ({ ...s, college_name: null }));
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const registrations = registrationsRes.data || [];
  const teams = computeTeamScores(submissions || [], registrations);

  return NextResponse.json({ teams });
}
