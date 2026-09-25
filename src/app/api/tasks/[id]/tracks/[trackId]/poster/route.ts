import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; trackId: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, trackId } = await params;
  const taskId = parseInt(id, 10);
  const trackIdNum = parseInt(trackId, 10);
  if (isNaN(taskId) || isNaN(trackIdNum)) {
    return NextResponse.json({ error: "Invalid task ID or track ID" }, { status: 400 });
  }

  const body = await request.json();
  const { poster_url } = body;

  if (!poster_url || typeof poster_url !== "string" || poster_url.trim().length === 0) {
    return NextResponse.json({ error: "Poster URL is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("tracks")
    .update({ poster_url: poster_url.trim() })
    .eq("id", trackIdNum)
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, track: data });
}