import { MAX_SCORE, TASK_POINTS, TOTAL_TASKS, clampScore } from "./constants";

export interface SubmissionRow {
  id?: number;
  team_id: string;
  member_name: string;
  member_name_normalized?: string;
  college_name?: string | null;
  task_id: number;
  score: number | null;
  answer?: string;
  link?: string | null;
  created_at?: string;
}

export interface RegistrationRow {
  registration_id: string;
  member_name: string;
  role?: string;
  team_name?: string;
}

export interface TeamScoreResult {
  team_id: string;
  member_count: number;
  submission_count: number;
  total_score: number; // 0 to 100
  avg_score: number | null; // average score across completed tasks (0 to 20)
  tasks_scored: number;
  task_averages: { task_id: number; avg: number }[];
  member_names: string[];
  colleges: string[];
}

/**
 * Computes team scores across the Virtual Hackathon 2K26 platform.
 *
 * TEAM SCORING LOGIC:
 * - Fetches registered members for each team from `registrations` using team_id / registration_id.
 * - Team size (2, 4, etc.) does NOT penalize or inflate scores:
 *   Team score on any task is the average of its members' scores.
 * - A team completing a task gets 20 for that task whether it has 2, 4, or 1 member.
 * - Total score is capped at MAX_SCORE (100) and rounded cleanly to 1 decimal place.
 */
export function computeTeamScores(
  submissions: SubmissionRow[],
  registrations: RegistrationRow[] = []
): TeamScoreResult[] {
  // Build map of registered members per team
  const regMap = new Map<string, Set<string>>();
  for (const reg of registrations) {
    const teamKey = (reg.registration_id || "").trim().toUpperCase();
    if (!teamKey) continue;
    const set = regMap.get(teamKey) || new Set<string>();
    if (reg.member_name) {
      set.add(reg.member_name.trim().toLowerCase());
    }
    regMap.set(teamKey, set);
  }

  // Group submissions by team_id
  const teamSubmissions = new Map<
    string,
    {
      displayTeamId: string;
      submissions: SubmissionRow[];
      memberNames: Set<string>;
      colleges: Set<string>;
      submittingMembers: Set<string>;
    }
  >();

  for (const sub of submissions) {
    const rawTeamId = (sub.team_id || "").trim();
    if (!rawTeamId) continue;
    const teamKey = rawTeamId.toUpperCase();

    const data = teamSubmissions.get(teamKey) || {
      displayTeamId: rawTeamId,
      submissions: [],
      memberNames: new Set<string>(),
      colleges: new Set<string>(),
      submittingMembers: new Set<string>(),
    };

    data.submissions.push(sub);
    if (sub.member_name) data.memberNames.add(sub.member_name.trim());
    if (sub.college_name) data.colleges.add(sub.college_name.trim());
    const norm = (sub.member_name_normalized || sub.member_name || "").trim().toLowerCase();
    if (norm) data.submittingMembers.add(norm);

    teamSubmissions.set(teamKey, data);
  }

  const results: TeamScoreResult[] = [];

  for (const [teamKey, data] of teamSubmissions.entries()) {
    const registeredMembers = regMap.get(teamKey);

    // Team size: from registrations table if present, otherwise from unique submitting members
    const teamSize = Math.max(
      registeredMembers && registeredMembers.size > 0
        ? registeredMembers.size
        : data.submittingMembers.size,
      1
    );

    // Group member scores per task: task_id -> Map of member_normalized -> score
    const taskMemberScores = new Map<number, Map<string, number>>();

    for (const sub of data.submissions) {
      if (sub.score !== null && sub.score !== undefined) {
        const taskId = sub.task_id;
        const memberKey = (sub.member_name_normalized || sub.member_name || "").trim().toLowerCase();
        const memberMap = taskMemberScores.get(taskId) || new Map<string, number>();

        // Each task is worth up to TASK_POINTS (20)
        const validScore = Math.min(TASK_POINTS, Math.max(0, sub.score));
        const prev = memberMap.get(memberKey);
        if (prev === undefined || validScore > prev) {
          memberMap.set(memberKey, validScore);
        }

        taskMemberScores.set(taskId, memberMap);
      }
    }

    // Compute task averages and team total score
    // For each task: sum of scores of members / teamSize
    const taskAverages: { task_id: number; avg: number }[] = [];
    let sumOfTaskAverages = 0;

    for (let t = 1; t <= TOTAL_TASKS; t++) {
      const memberMap = taskMemberScores.get(t);
      if (memberMap && memberMap.size > 0) {
        const totalPointsOnTask = Array.from(memberMap.values()).reduce((sum, s) => sum + s, 0);
        // Team score for this task = total points on task / teamSize
        const rawTaskAvg = totalPointsOnTask / teamSize;
        const taskAvg = clampScore(rawTaskAvg, TASK_POINTS);
        taskAverages.push({ task_id: t, avg: taskAvg });
        sumOfTaskAverages += rawTaskAvg;
      }
    }

    const teamTotalScore = clampScore(sumOfTaskAverages, MAX_SCORE);
    const avgScorePerTask =
      taskAverages.length > 0
        ? clampScore(teamTotalScore / taskAverages.length, TASK_POINTS)
        : null;

    results.push({
      team_id: data.displayTeamId,
      member_count: teamSize,
      submission_count: data.submissions.length,
      total_score: teamTotalScore,
      avg_score: avgScorePerTask,
      tasks_scored: taskAverages.length,
      task_averages: taskAverages.sort((a, b) => a.task_id - b.task_id),
      member_names: Array.from(data.memberNames),
      colleges: Array.from(data.colleges),
    });
  }

  // Sort by total_score descending, then tasks_scored descending, then team_id
  results.sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    if (b.tasks_scored !== a.tasks_scored) return b.tasks_scored - a.tasks_scored;
    return a.team_id.localeCompare(b.team_id);
  });

  return results;
}
