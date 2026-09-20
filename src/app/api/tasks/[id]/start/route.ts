import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { resolveTaskRulesAndTemplate } from "@/lib/task-rules";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await request.json();
  const { team_id, member_name, college_name } = body;

  if (!team_id || typeof team_id !== "string" || team_id.trim().length === 0) {
    return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
  }

  const normalizedTeamId = team_id.trim().toUpperCase();
  if (!normalizedTeamId.startsWith("TRI")) {
    return NextResponse.json(
      { error: 'Team ID must start with "TRI" (e.g. TRI-01, TRI_WARRIORS)' },
      { status: 400 }
    );
  }

  if (!member_name || typeof member_name !== "string" || member_name.trim().length === 0) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  }

  if (!college_name || typeof college_name !== "string" || college_name.trim().length === 0) {
    return NextResponse.json({ error: "College name is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Check task exists and is active
  let { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, description, is_active, rules, linkedin_template")
    .eq("id", taskId)
    .single();

  // Fallback if rules or linkedin_template columns do not exist yet in Supabase
  if (taskError && (taskError.code === "42703" || taskError.message?.includes("rules") || taskError.message?.includes("linkedin_template"))) {
    const retry = await supabase
      .from("tasks")
      .select("id, title, description, is_active")
      .eq("id", taskId)
      .single();
    task = retry.data ? { ...retry.data, rules: null, linkedin_template: null } : null;
    taskError = retry.error;
  }

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.is_active) {
    return NextResponse.json({ error: "This task is currently locked" }, { status: 403 });
  }

  const trimmedTeamId = normalizedTeamId;
  const trimmedName = member_name.trim();
  const normalizedName = trimmedName.toLowerCase();
  const trimmedCollege = college_name.trim();

  // Check if already submitted
  const { data: existing } = await supabase
    .from("submissions")
    .select("id")
    .eq("team_id", trimmedTeamId)
    .eq("member_name_normalized", normalizedName)
    .eq("task_id", taskId)
    .maybeSingle();

  // Set cookies
  const cookieStore = await cookies();
  cookieStore.set("team_id", trimmedTeamId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  cookieStore.set("member_name", trimmedName, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  cookieStore.set("college_name", trimmedCollege, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });

  const resolved = resolveTaskRulesAndTemplate({
    id: task.id,
    rules: task.rules,
    linkedin_template: task.linkedin_template,
  });

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      rules: resolved.rules,
      linkedin_template: resolved.linkedin_template,
    },
    already_submitted: !!existing,
  });
}
