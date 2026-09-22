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

  let { data: submissions, error } = await supabase
    .from("submissions")
    .select("id, team_id, member_name, college_name, future_plan, task_id, answer, link, score, created_at")
    .order("team_id", { ascending: true })
    .order("member_name", { ascending: true })
    .order("task_id", { ascending: true });

  // Fallback if columns do not exist yet in Supabase
  if (
    error &&
    (error.code === "42703" ||
      error.message?.includes("future_plan") ||
      error.message?.includes("college_name"))
  ) {
    const retry = await supabase
      .from("submissions")
      .select("id, team_id, member_name, task_id, answer, link, score, created_at")
      .order("team_id", { ascending: true })
      .order("member_name", { ascending: true })
      .order("task_id", { ascending: true });

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

  // Get task titles
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .order("id", { ascending: true });

  const taskMap = new Map((tasks || []).map((t) => [t.id, t.title]));

  const enriched = (submissions || []).map((s) => ({
    ...s,
    task_title: taskMap.get(s.task_id) || `Task ${s.task_id}`,
  }));

  return NextResponse.json({ submissions: enriched });
}
