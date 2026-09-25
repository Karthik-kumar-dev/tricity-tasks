import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export async function PATCH(
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
  const { name, poster_url, display_order } = body;

  const supabase = getSupabase();

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Track name cannot be empty" }, { status: 400 });
    }
    updateData.name = name.trim();
  }
  if (poster_url !== undefined) {
    updateData.poster_url = poster_url?.trim() || null;
  }
  if (display_order !== undefined) {
    updateData.display_order = display_order;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(updateData)
    .eq("id", trackIdNum)
    .eq("task_id", taskId)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A track with this name already exists for this task" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, track: data });
}

export async function DELETE(
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

  const supabase = getSupabase();

  const { error } = await supabase
    .from("tracks")
    .delete()
    .eq("id", trackIdNum)
    .eq("task_id", taskId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}