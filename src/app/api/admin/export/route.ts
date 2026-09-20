import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { rgb: "1F2233" } };
const HEADER_FONT = { bold: true, color: { rgb: "FFFFFF" }, name: "Sora", sz: 11 };

function buildRowsFromSubmissions(
  submissions: {
    team_id: string;
    member_name: string;
    college_name?: string | null;
    task_id: number;
    task_title: string;
    answer: string;
    link: string | null;
    score: number | null;
    created_at: string;
  }[]
): (string | number)[][] {
  return submissions.map((s) => [
    s.team_id,
    s.member_name,
    s.college_name || "—",
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
  ]);
}

function buildLeaderboardRows(
  submissions: {
    team_id: string;
    member_name: string;
    score: number | null;
  }[]
): (string | number)[][] {
  const teamMap = new Map<
    string,
    { members: Set<string>; count: number; total: number; scoredCount: number }
  >();

  for (const s of submissions) {
    const t = teamMap.get(s.team_id) || {
      members: new Set<string>(),
      count: 0,
      total: 0,
      scoredCount: 0,
    };
    t.members.add(s.member_name.toLowerCase());
    t.count++;
    if (s.score !== null && s.score !== undefined) {
      t.total += s.score;
      t.scoredCount++;
    }
    teamMap.set(s.team_id, t);
  }

  const teams = Array.from(teamMap.entries()).map(([teamId, d]) => ({
    team_id: teamId,
    member_count: d.members.size,
    submission_count: d.count,
    avg_score: d.scoredCount > 0 ? Math.round((d.total / d.scoredCount) * 10) / 10 : null,
    total_score: d.total,
  }));

  teams.sort(
    (a, b) => (b.total_score || 0) - (a.total_score || 0) || a.team_id.localeCompare(b.team_id)
  );

  return teams.map((t, i) => [
    i + 1,
    t.team_id,
    t.member_count,
    t.submission_count,
    t.avg_score === null ? "Not scored" : t.avg_score,
    t.total_score,
  ]);
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

  let query = supabase
    .from("submissions")
    .select("team_id, member_name, college_name, task_id, answer, link, score, created_at");

  if (taskId) {
    const parsed = parseInt(taskId, 10);
    if (Number.isNaN(parsed)) {
      return NextResponse.json({ error: "Invalid task_id" }, { status: 400 });
    }
    query = query.eq("task_id", parsed);
  }
  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  let { data: submissions, error } = await query
    .order("team_id", { ascending: true })
    .order("task_id", { ascending: true });

  // Fallback if college_name column does not exist yet in Supabase
  if (error && (error.code === "42703" || error.message?.includes("college_name"))) {
    let fallbackQuery = supabase
      .from("submissions")
      .select("team_id, member_name, task_id, answer, link, score, created_at");
    if (taskId) fallbackQuery = fallbackQuery.eq("task_id", parseInt(taskId, 10));
    if (teamId) fallbackQuery = fallbackQuery.eq("team_id", teamId);
    const retry = await fallbackQuery
      .order("team_id", { ascending: true })
      .order("task_id", { ascending: true });
    submissions = (retry.data || []).map((s) => ({ ...s, college_name: null }));
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Task titles for readable export
  const { data: tasks } = await supabase.from("tasks").select("id, title");
  const taskMap = new Map((tasks || []).map((t) => [t.id, t.title]));

  const enriched = (submissions || []).map((s) => ({
    ...s,
    task_title: taskMap.get(s.task_id) || `Task ${s.task_id}`,
  }));

  // ── Build workbook ──
  const wb = XLSX.utils.book_new();

  // Main data sheet
  const dataHeader = [
    "Team ID",
    "Member Name",
    "College",
    "Task",
    "Answer",
    "Link",
    "Score / 100",
    "Submitted At",
  ];
  const dataAoa = [dataHeader, ...buildRowsFromSubmissions(enriched)];
  const dataWs = XLSX.utils.aoa_to_sheet(dataAoa);
  styleSheet(dataWs, dataAoa);
  XLSX.utils.book_append_sheet(wb, dataWs, "Submissions");

  // Leaderboard summary sheet
  const lbHeader = ["Rank", "Team ID", "Members", "Submissions", "Avg Score", "Total Score"];
  const lbAoa = [lbHeader, ...buildLeaderboardRows(enriched)];
  const lbWs = XLSX.utils.aoa_to_sheet(lbAoa);
  styleSheet(lbWs, lbAoa);
  XLSX.utils.book_append_sheet(wb, lbWs, "Leaderboard");

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