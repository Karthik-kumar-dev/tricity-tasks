import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { computeTeamScores } from "@/lib/scoring";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const searchTeamId = searchParams.get("team_id");

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

  if (submissionsRes.error) {
    return NextResponse.json({ error: submissionsRes.error.message }, { status: 500 });
  }

  const submissions = submissionsRes.data || [];
  const registrations = registrationsRes.data || [];

  const teams = computeTeamScores(submissions, registrations);

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
}
