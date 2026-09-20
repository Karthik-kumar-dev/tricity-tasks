import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Get all submissions grouped by team_id
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("team_id, member_name, member_name_normalized, score");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by team
  const teamMap = new Map<
    string,
    {
      members: Set<string>;
      memberNames: Set<string>;
      submissionCount: number;
      scoredTotal: number;
      scoredCount: number;
    }
  >();

  for (const sub of submissions || []) {
    const team = teamMap.get(sub.team_id) || {
      members: new Set<string>(),
      memberNames: new Set<string>(),
      submissionCount: 0,
      scoredTotal: 0,
      scoredCount: 0,
    };
    team.members.add(sub.member_name_normalized);
    if (sub.member_name) team.memberNames.add(sub.member_name);
    team.submissionCount++;
    if (sub.score !== null && sub.score !== undefined) {
      team.scoredTotal += sub.score;
      team.scoredCount++;
    }
    teamMap.set(sub.team_id, team);
  }

  const teams = Array.from(teamMap.entries()).map(([teamId, data]) => ({
    team_id: teamId,
    member_count: data.members.size,
    submission_count: data.submissionCount,
    avg_score:
      data.scoredCount > 0
        ? Math.round((data.scoredTotal / data.scoredCount) * 10) / 10
        : null,
    total_score: data.scoredTotal,
    member_names: Array.from(data.memberNames),
  }));

  // Sort by total score descending, then team_id
  teams.sort((a, b) => (b.total_score || 0) - (a.total_score || 0) || a.team_id.localeCompare(b.team_id));

  return NextResponse.json({ teams });
}
