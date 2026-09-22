import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { resolveTaskRulesAndTemplate } from "@/lib/task-rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = getSupabase();

  let { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, description, is_active, rules, linkedin_template, instagram_template, links")
    .order("id", { ascending: true });

  // Fallback if columns do not exist yet in Supabase
  if (
    error &&
    (error.code === "42703" ||
      error.message?.includes("rules") ||
      error.message?.includes("linkedin_template") ||
      error.message?.includes("instagram_template") ||
      error.message?.includes("links"))
  ) {
    // Try without links column
    const retry1 = await supabase
      .from("tasks")
      .select("id, title, description, is_active, rules, linkedin_template, instagram_template")
      .order("id", { ascending: true });

    if (retry1.error) {
      // Try minimal columns
      const retry2 = await supabase
        .from("tasks")
        .select("id, title, description, is_active")
        .order("id", { ascending: true });
      tasks = (retry2.data || []).map((t) => ({
        ...t,
        rules: null,
        linkedin_template: null,
        instagram_template: null,
        links: null,
      }));
      error = retry2.error;
    } else {
      tasks = (retry1.data || []).map((t) => ({
        ...t,
        links: null,
      }));
      error = null;
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enrichedTasks = (tasks || []).map((t) => {
    const resolved = resolveTaskRulesAndTemplate(t);
    return {
      ...t,
      rules: resolved.rules,
      linkedin_template: resolved.linkedin_template,
      instagram_template: resolved.instagram_template,
      links: resolved.links,
    };
  });

  return NextResponse.json({ tasks: enrichedTasks });
}

