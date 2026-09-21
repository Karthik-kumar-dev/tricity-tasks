import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await params;
  const decodedTeamId = decodeURIComponent(teamId);

  const supabase = getSupabase();

  let { data: submissions, error } = await supabase
    .from("submissions")
    .select("id, member_name, college_name, future_plan, task_id, answer, link, score, created_at")
    .eq("team_id", decodedTeamId)
    .order("task_id", { ascending: true })
    .order("member_name", { ascending: true });

  // Fallback if future_plan or college_name column does not exist yet in Supabase
  if (
    error &&
    (error.code === "42703" ||
      error.message?.includes("future_plan") ||
      error.message?.includes("college_name"))
  ) {
    const retry = await supabase
      .from("submissions")
      .select("id, member_name, task_id, answer, link, score, created_at")
      .eq("team_id", decodedTeamId)
      .order("task_id", { ascending: true })
      .order("member_name", { ascending: true });
    submissions = (retry.data || []).map((s) => ({
      ...s,
      college_name: null,
      future_plan: null,
    }));
    error = retry.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get task titles for context
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .order("id", { ascending: true });

  const taskMap = new Map((tasks || []).map((t) => [t.id, t.title]));

  const enrichedSubmissions = (submissions || []).map((s) => ({
    ...s,
    task_title: taskMap.get(s.task_id) || `Task ${s.task_id}`,
  }));

  return NextResponse.json({
    team_id: decodedTeamId,
    submissions: enrichedSubmissions,
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamId } = await params;
  const decodedTeamId = decodeURIComponent(teamId);

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("submissions")
    .select("id")
    .eq("team_id", decodedTeamId)
    .limit(1);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const { error } = await supabase.from("submissions").delete().eq("team_id", decodedTeamId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
