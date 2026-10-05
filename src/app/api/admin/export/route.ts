import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabase, fetchAllRows } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";
import { MAX_SCORE, TASK_POINTS } from "@/lib/constants";
import { computeTeamScores, SubmissionRow, RegistrationRow } from "@/lib/scoring";

export const dynamic = "force-dynamic";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { rgb: "1F2233" } };
const HEADER_FONT = { bold: true, color: { rgb: "FFFFFF" }, name: "Sora", sz: 11 };

function buildRowsFromSubmissions(
  submissions: {
    team_id: string;
    member_name: string;
    college_name?: string | null;
    future_plan?: string | null;
    task_id: number;
    task_title: string;
    answer: string;
    link: string | null;
    score: number | null;
    created_at: string;
    track_id?: number | null;
  }[]
): (string | number)[][] {
  return submissions.map((s) => {
    const baseRow = [
      s.team_id,
      s.member_name,
      s.college_name || "—",
      s.future_plan || "—",
      s.task_title,
      s.answer,
      s.link || "",
      s.score === null || s.score === undefined ? "Not scored" : s.score,
      new Date(s.created_at).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    ];

    // Add Task 4 specific columns
    if (s.task_id === 4) {
      // For Task 4: track selected, LinkedIn URL, score, submitted-at
      // track selected comes from answer field or track_id
      // LinkedIn URL comes from link field
      const trackSelected = s.answer?.replace("Track selected: ", "") || (s.track_id ? `Track ${s.track_id}` : "");
      const linkedInUrl = s.link || "";
      return [...baseRow, trackSelected, linkedInUrl];
    }

    // For other tasks, add blank columns for Task 4 fields
    return [...baseRow, "", ""];
  });
}

function buildMemberLeaderboardRows(
  submissions: (SubmissionRow & {
    future_plan?: string | null;
    college_name?: string | null;
  })[],
  registrations: RegistrationRow[] = []
): (string | number)[][] {
  // 1. Compute team scores, ranks, and team-level task averages
  const teams = computeTeamScores(submissions, registrations);
  const teamScoreMap = new Map<
    string,
    {
      rank: number;
      teamId: string;
      teamSizeLabel: string;
      teamTaskAverages: Map<number, number>;
      avgScore: number;
      totalScore: number;
      submissionCount: number;
    }
  >();

  teams.forEach((t, i) => {
    const taskMap = new Map<number, number>();
    for (const ta of t.task_averages || []) {
      taskMap.set(ta.task_id, ta.avg);
    }
    const teamSizeLabel =
      t.member_count === 1
        ? "1 (Solo)"
        : t.member_count === 2
        ? "2 (Duo)"
        : t.member_count === 4
        ? "4 (Squad)"
        : `${t.member_count} Members`;

    teamScoreMap.set(t.team_id.trim().toUpperCase(), {
      rank: i + 1,
      teamId: t.team_id,
      teamSizeLabel,
      teamTaskAverages: taskMap,
      avgScore: t.avg_score === null ? 0 : t.avg_score,
      totalScore: t.total_score,
      submissionCount: t.submission_count,
    });
  });

  // 2. Build member map from registrations and submissions
  const memberMap = new Map<
    string,
    {
      teamId: string;
      teamName: string;
      role: string;
      memberName: string;
      collegeName: string | null;
      futurePlan: string | null;
      taskScores: Record<number, number | null>;
      submittedCount: number;
    }
  >();

  // Seed from registered participants
  for (const reg of registrations) {
    const rawTeamId = (reg.registration_id || "").trim();
    if (!rawTeamId || !reg.member_name) continue;
    const normKey = `${rawTeamId.toUpperCase()}:::${reg.member_name.trim().toLowerCase()}`;
    memberMap.set(normKey, {
      teamId: rawTeamId,
      teamName: reg.team_name || "—",
      role: reg.role || "Member",
      memberName: reg.member_name.trim(),
      collegeName: null,
      futurePlan: null,
      taskScores: {},
      submittedCount: 0,
    });
  }

  // Overlay submissions
  for (const sub of submissions) {
    const rawTeamId = (sub.team_id || "UNKNOWN").trim();
    if (!rawTeamId || !sub.member_name) continue;
    const normKey = `${rawTeamId.toUpperCase()}:::${sub.member_name.trim().toLowerCase()}`;
    let row = memberMap.get(normKey);
    if (!row) {
      row = {
        teamId: rawTeamId,
        teamName: "—",
        role: "Member",
        memberName: sub.member_name.trim(),
        collegeName: sub.college_name || null,
        futurePlan: sub.future_plan || null,
        taskScores: {},
        submittedCount: 0,
      };
      memberMap.set(normKey, row);
    }
    if (!row.collegeName && sub.college_name) row.collegeName = sub.college_name;
    if (!row.futurePlan && sub.future_plan) row.futurePlan = sub.future_plan;

    if (sub.task_id >= 1 && sub.task_id <= 5) {
      row.submittedCount += 1;
      if (typeof sub.score === "number") {
        row.taskScores[sub.task_id] = sub.score;
      }
    }
  }

  // Group members by team
  const teamMembers = new Map<string, Array<{
    teamId: string;
    teamName: string;
    role: string;
    memberName: string;
    collegeName: string | null;
    futurePlan: string | null;
    taskScores: Record<number, number | null>;
    submittedCount: number;
  }>>();

  for (const member of memberMap.values()) {
    const k = member.teamId.trim().toUpperCase();
    const list = teamMembers.get(k) || [];
    list.push(member);
    teamMembers.set(k, list);
  }

  // Sort each team's members (Leader first, then alphabetical)
  for (const list of teamMembers.values()) {
    list.sort((a, b) => {
      const aIsLeader = a.role.toLowerCase().includes("lead") ? 0 : 1;
      const bIsLeader = b.role.toLowerCase().includes("lead") ? 0 : 1;
      if (aIsLeader !== bIsLeader) return aIsLeader - bIsLeader;
      return a.memberName.localeCompare(b.memberName);
    });
  }

  // Collect teams to render in order of Rank
  const resultRows: (string | number)[][] = [];
  const processedTeamKeys = new Set<string>();

  for (const team of teams) {
    const teamKey = team.team_id.trim().toUpperCase();
    processedTeamKeys.add(teamKey);
    const teamMeta = teamScoreMap.get(teamKey)!;
    const members = teamMembers.get(teamKey) || [];

    const t1Team = teamMeta.teamTaskAverages.get(1) ?? 0;
    const t2Team = teamMeta.teamTaskAverages.get(2) ?? 0;
    const t3Team = teamMeta.teamTaskAverages.get(3) ?? 0;
    const t4Team = teamMeta.teamTaskAverages.get(4) ?? 0;
    const t5Team = teamMeta.teamTaskAverages.get(5) ?? 0;

    if (members.length === 0) {
      // Fallback if no individual member rows exist
      resultRows.push([
        teamMeta.rank,
        teamMeta.teamId,
        "—",
        teamMeta.teamSizeLabel,
        team.member_names?.join(", ") || "—",
        "—",
        team.colleges?.join(", ") || "—",
        "—",
        t1Team,
        t2Team,
        t3Team,
        t4Team,
        t5Team,
        teamMeta.totalScore,
        teamMeta.totalScore,
      ]);
    } else {
      for (const m of members) {
        const m1 = m.taskScores[1] !== undefined && m.taskScores[1] !== null ? m.taskScores[1] : 0;
        const m2 = m.taskScores[2] !== undefined && m.taskScores[2] !== null ? m.taskScores[2] : 0;
        const m3 = m.taskScores[3] !== undefined && m.taskScores[3] !== null ? m.taskScores[3] : 0;
        const m4 = m.taskScores[4] !== undefined && m.taskScores[4] !== null ? m.taskScores[4] : 0;
        const m5 = m.taskScores[5] !== undefined && m.taskScores[5] !== null ? m.taskScores[5] : 0;
        const mTotal = m1 + m2 + m3 + m4 + m5;

        resultRows.push([
          teamMeta.rank,
          m.teamId,
          m.teamName,
          teamMeta.teamSizeLabel,
          m.memberName,
          m.role,
          m.collegeName || "—",
          m.futurePlan || "—",
          m1,
          m2,
          m3,
          m4,
          m5,
          mTotal,
          teamMeta.totalScore,
        ]);
      }
    }
  }

  // Include any remaining registered teams that have 0 submissions yet
  for (const [teamKey, members] of teamMembers.entries()) {
    if (processedTeamKeys.has(teamKey)) continue;
    const teamSizeLabel =
      members.length === 1
        ? "1 (Solo)"
        : members.length === 2
        ? "2 (Duo)"
        : members.length === 4
        ? "4 (Squad)"
        : `${members.length} Members`;

    for (const m of members) {
      resultRows.push([
        "—",
        m.teamId,
        m.teamName,
        teamSizeLabel,
        m.memberName,
        m.role,
        m.collegeName || "—",
        m.futurePlan || "—",
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]);
    }
  }

  return resultRows;
}

function buildTeamSummaryRows(
  submissions: (SubmissionRow & { future_plan?: string | null })[],
  registrations: RegistrationRow[] = []
): (string | number)[][] {
  const teams = computeTeamScores(submissions, registrations);

  // Collect future plans for each team
  const teamPlans = new Map<string, Set<string>>();
  for (const s of submissions) {
    if (s.future_plan && s.future_plan.trim() && s.future_plan !== "—") {
      const k = s.team_id.trim().toUpperCase();
      const plans = teamPlans.get(k) || new Set<string>();
      plans.add(s.future_plan.trim());
      teamPlans.set(k, plans);
    }
  }

  return teams.map((t, i) => {
    const plans = teamPlans.get(t.team_id.trim().toUpperCase());
    const plansStr = plans && plans.size > 0 ? Array.from(plans).join(", ") : "—";
    const membersStr = t.member_names && t.member_names.length > 0 ? t.member_names.join(", ") : "—";
    const collegesStr = t.colleges && t.colleges.length > 0 ? t.colleges.join(", ") : "—";

    // Map each task's calculated team average score
    const taskScoreMap = new Map<number, number>();
    for (const ta of t.task_averages || []) {
      taskScoreMap.set(ta.task_id, ta.avg);
    }

    const t1 = taskScoreMap.get(1) ?? 0;
    const t2 = taskScoreMap.get(2) ?? 0;
    const t3 = taskScoreMap.get(3) ?? 0;
    const t4 = taskScoreMap.get(4) ?? 0;
    const t5 = taskScoreMap.get(5) ?? 0;

    const teamSizeLabel =
      t.member_count === 1
        ? "1 (Solo)"
        : t.member_count === 2
        ? "2 (Duo)"
        : t.member_count === 4
        ? "4 (Squad)"
        : `${t.member_count} Members`;

    return [
      i + 1,
      t.team_id,
      teamSizeLabel,
      membersStr,
      collegesStr,
      plansStr,
      t.submission_count,
      t1,
      t2,
      t3,
      t4,
      t5,
      t.avg_score === null ? 0 : t.avg_score,
      t.total_score,
    ];
  });
}

function styleSheet(
  ws: XLSX.WorkSheet,
  aoa: (string | number)[][],
  maxColWidth = 60
) {
  const numCols = aoa[0]?.length || 0;
  const numRows = aoa.length;

  // Bold header row with fill
  for (let c = 0; c < numCols; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) {
      cell.s = {
        font: HEADER_FONT,
        fill: HEADER_FILL,
        alignment: { vertical: "center", horizontal: "center" },
      };
    }
  }

  // Column widths based on content length
  const widths: { wch: number }[] = [];
  for (let c = 0; c < numCols; c++) {
    let maxLen = 12;
    for (let r = 0; r < numRows; r++) {
      const val = aoa[r]?.[c];
      const len = val !== undefined && val !== null ? String(val).length : 0;
      if (len > maxLen) maxLen = len;
    }
    widths.push({ wch: Math.min(maxLen + 2, maxColWidth) });
  }
  ws["!cols"] = widths;

  // Enable auto-filter on header row
  if (numRows > 1) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: numRows - 1, c: numCols - 1 } }),
    };
  }
}

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const taskId = searchParams.get("task_id");
  const teamId = searchParams.get("team_id")
    ? decodeURIComponent(searchParams.get("team_id") || "")
    : null;

  const supabase = getSupabase();

  let submissions: any[] = [];
  try {
    submissions = await fetchAllRows(
      supabase,
      "submissions",
      "team_id, member_name, member_name_normalized, college_name, future_plan, task_id, answer, link, score, created_at, track_id",
      (q) => {
        let applied = q;
        if (taskId) {
          const parsed = parseInt(taskId, 10);
          applied = applied.eq("task_id", parsed);
        }
        if (teamId) {
          applied = applied.eq("team_id", teamId);
        }
        return applied
          .order("team_id", { ascending: true })
          .order("task_id", { ascending: true });
      }
    );
  } catch (error: any) {
    // Fallback if college_name, future_plan, or member_name_normalized column does not exist yet in Supabase
    if (
      error &&
      (error.code === "42703" ||
        error.message?.includes("college_name") ||
        error.message?.includes("future_plan") ||
        error.message?.includes("member_name_normalized"))
    ) {
      try {
        const retry = await fetchAllRows(
          supabase,
          "submissions",
          "team_id, member_name, task_id, answer, link, score, created_at, track_id",
          (q) => {
            let applied = q;
            if (taskId) applied = applied.eq("task_id", parseInt(taskId, 10));
            if (teamId) applied = applied.eq("team_id", teamId);
            return applied
              .order("team_id", { ascending: true })
              .order("task_id", { ascending: true });
          }
        );
        submissions = retry.map((s: any) => ({
          ...s,
          member_name_normalized: String(s.member_name || "").toLowerCase().trim(),
          college_name: null,
          future_plan: null,
          track_id: null,
        }));
      } catch (retryErr: any) {
        return NextResponse.json({ error: retryErr.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Task titles and all registrations for readable export
  const [{ data: tasks }, registrations] = await Promise.all([
    supabase.from("tasks").select("id, title"),
    fetchAllRows<RegistrationRow>(supabase, "registrations", "registration_id, team_name, role, member_name").catch((err) => {
      console.warn("Could not fetch registrations in export:", err?.message);
      return [];
    }),
  ]);
  const taskMap = new Map((tasks || []).map((t) => [t.id, t.title]));

  // Build a lookup map of known future plans per team+member and per team
  const planByMemberKey = new Map<string, string>();
  const planByTeam = new Map<string, string>();
  for (const s of submissions || []) {
    if (s.future_plan && typeof s.future_plan === "string" && s.future_plan.trim() && s.future_plan !== "—") {
      const plan = s.future_plan.trim();
      const memberKey = `${(s.team_id || "").toUpperCase().trim()}:::${(s.member_name || "").toLowerCase().trim()}`;
      if (!planByMemberKey.has(memberKey)) {
        planByMemberKey.set(memberKey, plan);
      }
      const teamKey = (s.team_id || "").toUpperCase().trim();
      if (!planByTeam.has(teamKey)) {
        planByTeam.set(teamKey, plan);
      }
    }
  }

  const enriched = (submissions || []).map((s) => {
    const memberKey = `${(s.team_id || "").toUpperCase().trim()}:::${(s.member_name || "").toLowerCase().trim()}`;
    const teamKey = (s.team_id || "").toUpperCase().trim();
    const resolvedPlan =
      (s.future_plan && typeof s.future_plan === "string" && s.future_plan.trim() && s.future_plan !== "—")
        ? s.future_plan.trim()
        : planByMemberKey.get(memberKey) ||
          planByTeam.get(teamKey) ||
          null;

    return {
      ...s,
      future_plan: resolvedPlan,
      task_title: taskMap.get(s.task_id) || `Task ${s.task_id}`,
    };
  });

  // ── Build workbook ──
  const wb = XLSX.utils.book_new();

  // 1. Member Scores & Team Leaderboard (Main Sheet: Each member separate with their own task scores + common team total)
  const detailedHeader = [
    "Team Rank",
    "Team ID",
    "Team Name",
    "Team Size",
    "Member Name",
    "Role",
    "College",
    "Future Plan",
    `Member Task 1 (/20)`,
    `Member Task 2 (/20)`,
    `Member Task 3 (/20)`,
    `Member Task 4 (/20)`,
    `Member Task 5 (/20)`,
    `Member Total (/100)`,
    `Common Team Total Score (/100)`,
  ];
  const detailedAoa = [detailedHeader, ...buildMemberLeaderboardRows(enriched, registrations || [])];
  const detailedWs = XLSX.utils.aoa_to_sheet(detailedAoa);
  styleSheet(detailedWs, detailedAoa);
  XLSX.utils.book_append_sheet(wb, detailedWs, "Leaderboard & Member Scores");

  // 2. Team Summary Leaderboard (1 row per team overview)
  const lbHeader = [
    "Rank",
    "Team ID",
    "Team Size",
    "Members",
    "Colleges",
    "Future Plans",
    "Total Submissions",
    `Task 1 Score (Max ${TASK_POINTS})`,
    `Task 2 Score (Max ${TASK_POINTS})`,
    `Task 3 Score (Max ${TASK_POINTS})`,
    `Task 4 Score (Max ${TASK_POINTS})`,
    `Task 5 Score (Max ${TASK_POINTS})`,
    `Team Avg / Task (Max ${TASK_POINTS})`,
    `Team Total Score (Max ${MAX_SCORE})`,
  ];
  const lbAoa = [lbHeader, ...buildTeamSummaryRows(enriched, registrations || [])];
  const lbWs = XLSX.utils.aoa_to_sheet(lbAoa);
  styleSheet(lbWs, lbAoa);
  XLSX.utils.book_append_sheet(wb, lbWs, "Team Summary");

  // 3. Detailed Submissions Log sheet
  const dataHeader = [
    "Team ID",
    "Member Name",
    "College",
    "Future Plan",
    "Task",
    "Answer",
    "Link",
    `Score / ${TASK_POINTS}`,
    "Submitted At",
    "Track Selected (Task 4)",
    "LinkedIn URL (Task 4)",
  ];
  const dataAoa = [dataHeader, ...buildRowsFromSubmissions(enriched)];
  const dataWs = XLSX.utils.aoa_to_sheet(dataAoa);
  styleSheet(dataWs, dataAoa);
  XLSX.utils.book_append_sheet(wb, dataWs, "Submissions Log");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const dateTag = new Date().toISOString().slice(0, 10);
  let filename = `tricity-all-submissions-${dateTag}.xlsx`;
  if (taskId) {
    const t = tasks?.find((task) => task.id === parseInt(taskId, 10));
    const slug = (t?.title || `task-${taskId}`).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    filename = `tricity-${slug}${dateTag ? "-" + dateTag : ""}.xlsx`;
  } else if (teamId) {
    const slug = teamId.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    filename = `tricity-${slug}${dateTag ? "-" + dateTag : ""}.xlsx`;
  }

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}