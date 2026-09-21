import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";
import { TASK_POINTS, roundScore } from "@/lib/constants";

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

  const numScore = roundScore(parseFloat(score));
  if (isNaN(numScore) || numScore < 0 || numScore > TASK_POINTS) {
    return NextResponse.json(
      { error: `Score must be between 0 and ${TASK_POINTS}` },
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
