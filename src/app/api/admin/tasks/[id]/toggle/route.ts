import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get current state
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("id, is_active")
    .eq("id", taskId)
    .single();

  if (fetchError || !task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const newState = !task.is_active;

  const { error: updateError } = await supabase
    .from("tasks")
    .update({ is_active: newState })
    .eq("id", taskId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, is_active: newState });
}
