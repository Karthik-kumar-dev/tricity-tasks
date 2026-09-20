import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

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
  const { team_id, member_name, answer, link } = body;

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
  if (!answer || typeof answer !== "string" || answer.trim().length === 0) {
    return NextResponse.json({ error: "Answer is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Verify task is active
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, is_active")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (!task.is_active) {
    return NextResponse.json({ error: "This task is currently locked" }, { status: 403 });
  }

  const trimmedTeamId = normalizedTeamId;
  const trimmedName = member_name.trim();
  const normalizedName = trimmedName.toLowerCase();

  // Check for existing submission (server-side duplicate check)
  const { data: existing } = await supabase
    .from("submissions")
    .select("id")
    .eq("team_id", trimmedTeamId)
    .eq("member_name_normalized", normalizedName)
    .eq("task_id", taskId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted this task" },
      { status: 409 }
    );
  }

  // Insert submission (UNIQUE constraint acts as final guard)
  const { error: insertError } = await supabase.from("submissions").insert({
    team_id: trimmedTeamId,
    member_name: trimmedName,
    member_name_normalized: normalizedName,
    task_id: taskId,
    answer: answer.trim(),
    link: link && typeof link === "string" ? link.trim() || null : null,
  });

  if (insertError) {
    // Handle unique constraint violation
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "You have already submitted this task" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
