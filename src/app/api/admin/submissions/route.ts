import { NextResponse } from "next/server";
import { getSupabase, fetchAllRows } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  let submissions: any[] = [];
  try {
    submissions = await fetchAllRows(
      supabase,
      "submissions",
      "id, team_id, member_name, college_name, future_plan, task_id, answer, link, score, created_at",
      (q) =>
        q
          .order("team_id", { ascending: true })
          .order("member_name", { ascending: true })
          .order("task_id", { ascending: true })
    );
  } catch (error: any) {
    // Fallback if columns do not exist yet in Supabase
    if (
      error.code === "42703" ||
      error.message?.includes("future_plan") ||
      error.message?.includes("college_name")
    ) {
      try {
        const retry = await fetchAllRows(
          supabase,
          "submissions",
          "id, team_id, member_name, task_id, answer, link, score, created_at",
          (q) =>
            q
              .order("team_id", { ascending: true })
              .order("member_name", { ascending: true })
              .order("task_id", { ascending: true })
        );
        submissions = retry.map((s) => ({
          ...s,
          college_name: null,
          future_plan: null,
        }));
      } catch (retryErr: any) {
        return NextResponse.json({ error: retryErr.message }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Also fetch all registrations concurrently so admin page has all registered participants (1200+ users)
  let registrations: any[] = [];
  try {
    registrations = await fetchAllRows(
      supabase,
      "registrations",
      "id, registration_id, team_name, role, member_name",
      (q) =>
        q
          .order("registration_id", { ascending: true })
          .order("member_name", { ascending: true })
    );
  } catch (err: any) {
    console.warn("Could not fetch registrations in admin submissions:", err?.message);
  }

  // Get task titles
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .order("id", { ascending: true });

  const taskMap = new Map((tasks || []).map((t) => [t.id, t.title]));

  const enriched = (submissions || []).map((s) => ({
    ...s,
    task_title: taskMap.get(s.task_id) || `Task ${s.task_id}`,
  }));

  return NextResponse.json({ submissions: enriched, registrations });
}
