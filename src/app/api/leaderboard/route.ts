import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const searchTeamId = searchParams.get("team_id");

  const supabase = getSupabase();

  // Get all submissions with task_id for per-task average calculation
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select("team_id, task_id, score");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate by team
  const teamMap = new Map<
    string,
    {
      taskScores: Map<number, number[]>; // task_id -> array of scores
      totalScore: number;
      scoredCount: number;
    }
  >();

  for (const sub of submissions || []) {
    const team = teamMap.get(sub.team_id) || {
      taskScores: new Map<number, number[]>(),
      totalScore: 0,
      scoredCount: 0,
    };

    if (sub.score !== null && sub.score !== undefined) {
      // Track per-task scores
      const taskArr = team.taskScores.get(sub.task_id) || [];
      taskArr.push(sub.score);
      team.taskScores.set(sub.task_id, taskArr);

      team.totalScore += sub.score;
      team.scoredCount++;
    }

    teamMap.set(sub.team_id, team);
  }

  const teams = Array.from(teamMap.entries()).map(([teamId, data]) => {
    // Calculate average score per task, then overall average across tasks
    const taskAverages: { task_id: number; avg: number }[] = [];
    for (const [taskId, scores] of data.taskScores.entries()) {
      const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      taskAverages.push({ task_id: taskId, avg });
    }

    // Overall average = average of all task averages
    const overallAvg =
      taskAverages.length > 0
        ? Math.round(
            (taskAverages.reduce((sum, t) => sum + t.avg, 0) / taskAverages.length) * 10
          ) / 10
        : null;

    return {
      team_id: teamId,
      total_score: data.totalScore,
      avg_score: overallAvg,
      tasks_scored: taskAverages.length,
      task_averages: taskAverages.sort((a, b) => a.task_id - b.task_id),
    };
  });

  // Sort by total score descending
  teams.sort(
    (a, b) => (b.total_score || 0) - (a.total_score || 0) || a.team_id.localeCompare(b.team_id)
  );

  // If searching for a specific team
  if (searchTeamId) {
    const found = teams.find(
      (t) => t.team_id.toLowerCase() === searchTeamId.toLowerCase()
    );
    const rank = found
      ? teams.findIndex(
          (t) => t.team_id.toLowerCase() === searchTeamId.toLowerCase()
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
