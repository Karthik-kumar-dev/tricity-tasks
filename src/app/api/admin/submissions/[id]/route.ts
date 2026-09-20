import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const submissionId = parseInt(id, 10);
  if (Number.isNaN(submissionId)) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: existing, error: fetchError } = await supabase
    .from("submissions")
    .select("id")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const { error } = await supabase.from("submissions").delete().eq("id", submissionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}