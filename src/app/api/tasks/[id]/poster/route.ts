import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") || "common";

  const supabase = getSupabase();

  if (type === "common") {
    const { data, error } = await supabase
      .from("task_posters")
      .select("poster_url")
      .eq("task_id", taskId)
      .eq("is_common", true)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ poster_url: data?.poster_url || null });
  }

  return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
}

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
  const { poster_url, is_common = true } = body;

  if (!poster_url || typeof poster_url !== "string" || poster_url.trim().length === 0) {
    return NextResponse.json({ error: "Poster URL is required" }, { status: 400 });
  }

  const supabase = getSupabase();

  if (is_common) {
    const { data, error } = await supabase
      .from("task_posters")
      .upsert({
        task_id: taskId,
        poster_url: poster_url.trim(),
        is_common: true,
      }, {
        onConflict: "task_id,is_common",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, poster: data });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}