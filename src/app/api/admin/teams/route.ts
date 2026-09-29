import { NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";
import { computeTeamScores, SubmissionRow, RegistrationRow } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  try {
    // Fetch all submissions and registrations concurrently without 1000 limit
    const [submissions, registrations] = await Promise.all([
      fetchAllRows<SubmissionRow>(
        supabase,
        "submissions",
        "team_id, member_name, member_name_normalized, college_name, task_id, score"
      ).catch(async (error) => {
        // Fallback if college_name column does not exist yet in Supabase
        if (error && (error.code === "42703" || error.message?.includes("college_name"))) {
          const retry = await fetchAllRows<SubmissionRow>(
            supabase,
            "submissions",
            "team_id, member_name, member_name_normalized, task_id, score"
          );
          return retry.map((s) => ({ ...s, college_name: null }));
        }
        throw error;
      }),
      fetchAllRows<RegistrationRow>(supabase, "registrations", "registration_id, member_name").catch((err) => {
        console.warn("Could not fetch registrations in admin teams:", err?.message);
        return [];
      }),
    ]);

    const teams = computeTeamScores(submissions || [], registrations || []);
    return NextResponse.json({ teams });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
