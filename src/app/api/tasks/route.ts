import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, description, is_active")
    .order("id", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks });
}
