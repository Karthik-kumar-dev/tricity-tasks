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
  const rawTeamId = (body.registration_id || body.team_id || "") as string;
  const rawMemberName = (body.member_name || "") as string;
  const rawCollegeName = (body.college_name || "") as string;
  const rawTeamName = (body.team_name || "") as string;
  const rawRole = (body.role || "") as string;

  if (!rawTeamId || typeof rawTeamId !== "string" || rawTeamId.trim().length === 0) {
    return NextResponse.json({ error: "Registration / Team ID is required" }, { status: 400 });
  }

  const normalizedTeamId = rawTeamId.trim().toUpperCase();

  if (!rawMemberName || typeof rawMemberName !== "string" || rawMemberName.trim().length === 0) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  }

  if (!rawCollegeName || typeof rawCollegeName !== "string" || rawCollegeName.trim().length === 0) {
    return NextResponse.json({ error: "College name is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Check task exists and is active
  let { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, description, is_active, rules, linkedin_template, instagram_template")
    .eq("id", taskId)
    .single();

  // Fallback if rules, linkedin_template, or instagram_template columns do not exist yet in Supabase
  if (
    taskError &&
    (taskError.code === "42703" ||
      taskError.message?.includes("rules") ||
      taskError.message?.includes("linkedin_template") ||
      taskError.message?.includes("instagram_template"))
  ) {
    const retry = await supabase
      .from("tasks")
      .select("id, title, description, is_active")
      .eq("id", taskId)
      .single();
    task = retry.data
      ? { ...retry.data, rules: null, linkedin_template: null, instagram_template: null }
      : null;
    taskError = retry.error;
  }

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.is_active) {
    return NextResponse.json({ error: "This task is currently locked" }, { status: 403 });
  }

  const trimmedTeamId = normalizedTeamId;
  const trimmedName = rawMemberName.trim();
  const normalizedName = trimmedName.toLowerCase();
  const trimmedCollege = rawCollegeName.trim();

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
  if (rawTeamName.trim()) {
    cookieStore.set("team_name", rawTeamName.trim(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });
  }
  cookieStore.set("member_name", trimmedName, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });
  if (rawRole.trim()) {
    cookieStore.set("member_role", rawRole.trim(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });
  }
  cookieStore.set("college_name", trimmedCollege, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
  });

  const resolved = resolveTaskRulesAndTemplate({
    id: task.id,
    rules: task.rules,
    linkedin_template: task.linkedin_template,
    instagram_template: task.instagram_template,
  });

  return NextResponse.json({
    task: {
      id: task.id,
      title: task.title,
      description: task.description,
      rules: resolved.rules,
      linkedin_template: resolved.linkedin_template,
      instagram_template: resolved.instagram_template,
    },
    already_submitted: !!existing,
  });
}
