import { NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase-server";
import { computeTeamScores, SubmissionRow, RegistrationRow } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const searchTeamId = searchParams.get("team_id");

  const supabase = getSupabase();

  try {
    // Fetch all submissions and registrations concurrently
    const [submissions, registrations] = await Promise.all([
      fetchAllRows<SubmissionRow>(
        supabase,
        "submissions",
        "team_id, member_name, member_name_normalized, college_name, task_id, score"
      ).catch(async (error) => {
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
        console.warn("Could not fetch registrations in leaderboard:", err?.message);
        return [];
      }),
    ]);

    const teams = computeTeamScores(submissions || [], registrations || []);

    // If searching for a specific team
    if (searchTeamId) {
      const cleanSearch = searchTeamId.trim().toLowerCase();
      const found = teams.find(
        (t) => t.team_id.toLowerCase() === cleanSearch
      );
      const rank = found
        ? teams.findIndex(
            (t) => t.team_id.toLowerCase() === cleanSearch
          ) + 1
        : null;
      return NextResponse.json({
        team: found || null,
        rank,
      });
    }

    // Return top 5 teams
    return NextResponse.json({ teams: teams.slice(0, 5) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
