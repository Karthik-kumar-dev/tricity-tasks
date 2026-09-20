import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const submissionId = parseInt(id, 10);
  if (isNaN(submissionId)) {
    return NextResponse.json({ error: "Invalid submission ID" }, { status: 400 });
  }

  const body = await request.json();
  const { score } = body;

  if (score === null || score === undefined) {
    return NextResponse.json({ error: "Score is required" }, { status: 400 });
  }

  const numScore = parseInt(score, 10);
  if (isNaN(numScore) || numScore < 0 || numScore > 100) {
    return NextResponse.json(
      { error: "Score must be between 0 and 100" },
      { status: 400 }
    );
  }

  const supabase = getSupabase();

  const { error } = await supabase
    .from("submissions")
    .update({ score: numScore })
    .eq("id", submissionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, score: numScore });
}
