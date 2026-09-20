import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";
import { saveLocalOverride, resolveTaskRulesAndTemplate } from "@/lib/task-rules";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await request.json();
  const { rules, linkedin_template, title, description } = body;

  const updateData: Record<string, unknown> = {};
  if (typeof rules === "string") updateData.rules = rules.trim() || null;
  if (typeof linkedin_template === "string") {
    updateData.linkedin_template = linkedin_template.trim() || null;
  }
  if (typeof title === "string" && title.trim()) updateData.title = title.trim();
  if (typeof description === "string" && description.trim()) {
    updateData.description = description.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Save to local override storage immediately for zero-friction resilience
  saveLocalOverride(taskId, {
    rules: typeof rules === "string" ? rules : undefined,
    linkedin_template: typeof linkedin_template === "string" ? linkedin_template : undefined,
    title: typeof title === "string" ? title : undefined,
    description: typeof description === "string" ? description : undefined,
  });

  const supabase = getSupabase();

  let { data, error } = await supabase
    .from("tasks")
    .update(updateData)
    .eq("id", taskId)
    .select("id, title, description, is_active, rules, linkedin_template")
    .single();

  // If columns don't exist yet in Supabase, update basic fields and resolve
  if (
    error &&
    (error.code === "42703" ||
      error.message?.includes("rules") ||
      error.message?.includes("linkedin_template"))
  ) {
    const basicUpdate: Record<string, unknown> = {};
    if (updateData.title) basicUpdate.title = updateData.title;
    if (updateData.description) basicUpdate.description = updateData.description;

    if (Object.keys(basicUpdate).length > 0) {
      const retry = await supabase
        .from("tasks")
        .update(basicUpdate)
        .eq("id", taskId)
        .select("id, title, description, is_active")
        .single();
      data = retry.data ? { ...retry.data, rules: null, linkedin_template: null } : null;
      error = retry.error;
    } else {
      const fetchCurrent = await supabase
        .from("tasks")
        .select("id, title, description, is_active")
        .eq("id", taskId)
        .single();
      data = fetchCurrent.data ? { ...fetchCurrent.data, rules: null, linkedin_template: null } : null;
      error = fetchCurrent.error;
    }
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Task not found" }, { status: 500 });
  }

  const resolved = resolveTaskRulesAndTemplate({
    id: data.id,
    rules: data.rules,
    linkedin_template: data.linkedin_template,
  });

  return NextResponse.json({
    success: true,
    task: {
      ...data,
      rules: resolved.rules,
      linkedin_template: resolved.linkedin_template,
    },
  });
}

