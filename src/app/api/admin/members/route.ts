import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const teamId = searchParams.get("team_id");
  const memberName = searchParams.get("member_name");

  if (!teamId || !teamId.trim()) {
    return NextResponse.json({ error: "team_id is required" }, { status: 400 });
  }
  if (!memberName || !memberName.trim()) {
    return NextResponse.json({ error: "member_name is required" }, { status: 400 });
  }

  const trimmedTeamId = teamId.trim();
  const normalizedMemberName = memberName.trim().toLowerCase();

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("submissions")
    .select("id")
    .eq("team_id", trimmedTeamId)
    .eq("member_name_normalized", normalizedMemberName)
    .limit(1);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: "Member not found in this team" }, { status: 404 });
  }

  const { error } = await supabase
    .from("submissions")
    .delete()
    .eq("team_id", trimmedTeamId)
    .eq("member_name_normalized", normalizedMemberName);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}