import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const teamId = request.cookies.get("team_id")?.value;
  const memberName = request.cookies.get("member_name")?.value;

  if (!teamId || !memberName) {
    return NextResponse.json({ submitted: false });
  }

  const normalizedName = memberName.trim().toLowerCase();
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("submissions")
    .select("id, link, answer, college_name")
    .eq("team_id", teamId.trim())
    .eq("member_name_normalized", normalizedName)
    .eq("task_id", taskId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ submitted: false });
  }

  return NextResponse.json({
    submitted: true,
    link: existing.link || null,
    answer: existing.answer || null,
    college_name: existing.college_name || null,
  });
}