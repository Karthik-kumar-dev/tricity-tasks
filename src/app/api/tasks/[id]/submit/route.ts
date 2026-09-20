import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

// Task 1 ("Share Your Registration Poster") accepts a LinkedIn post URL only.
const POSTER_TASK_ID = 1;

// A valid public LinkedIn share link. Two accepted shapes from the spec:
//   https://www.linkedin.com/posts/...   (post permalink)
//   https://www.linkedin.com/feed/update/... (feed activity update)
const LINKEDIN_URL_RE =
  /^https:\/\/(www\.)?linkedin\.com\/(posts|feed\/update)\//i;

function isLinkedInUrl(value: string): boolean {
  return LINKEDIN_URL_RE.test(value.trim());
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
  const { team_id, member_name, college_name, answer, link } = body;

  if (!team_id || typeof team_id !== "string" || team_id.trim().length === 0) {
    return NextResponse.json({ error: "Team ID is required" }, { status: 400 });
  }

  const normalizedTeamId = team_id.trim().toUpperCase();
  if (!normalizedTeamId.startsWith("TRI")) {
    return NextResponse.json(
      { error: 'Team ID must start with "TRI" (e.g. TRI-01, TRI_WARRIORS)' },
      { status: 400 }
    );
  }

  if (!member_name || typeof member_name !== "string" || member_name.trim().length === 0) {
    return NextResponse.json({ error: "Your name is required" }, { status: 400 });
  }

  const isPosterTask = taskId === POSTER_TASK_ID;
  const answerStr = answer && typeof answer === "string" ? answer.trim() : "";
  const linkStr = link && typeof link === "string" ? link.trim() : "";

  if (!answerStr && !linkStr) {
    return NextResponse.json({ error: "An answer or link is required" }, { status: 400 });
  }

  if (isPosterTask && !linkStr) {
    return NextResponse.json(
      { error: "A LinkedIn post URL is required for this task" },
      { status: 400 }
    );
  }

  if (linkStr) {
    const isLinkedIn = isLinkedInUrl(linkStr);
    if (isPosterTask && !isLinkedIn) {
      return NextResponse.json(
        {
          error:
            "Please paste a valid public LinkedIn post URL, e.g. https://www.linkedin.com/posts/... or https://www.linkedin.com/feed/update/...",
        },
        { status: 400 }
      );
    }
  }

  const supabase = getSupabase();

  // Verify task is active (with lightweight in-memory cache to handle concurrent bursts)
  const isTaskActive = await checkTaskIsActive(supabase, taskId);
  if (isTaskActive === null) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!isTaskActive) {
    return NextResponse.json({ error: "This task is currently locked" }, { status: 403 });
  }

  const trimmedTeamId = normalizedTeamId;
  const trimmedName = member_name.trim();
  const normalizedName = trimmedName.toLowerCase();
  const trimmedCollege =
    college_name && typeof college_name === "string" && college_name.trim().length > 0
      ? college_name.trim()
      : null;

  const finalAnswer =
    answerStr || (isPosterTask ? "Shared registration poster on LinkedIn" : "");

  const payload: Record<string, unknown> = {
    team_id: trimmedTeamId,
    member_name: trimmedName,
    member_name_normalized: normalizedName,
    task_id: taskId,
    answer: finalAnswer,
    link: linkStr || null,
  };
  if (trimmedCollege) {
    payload.college_name = trimmedCollege;
  }

  let { error: insertError } = await supabase.from("submissions").insert(payload);

  // Fallback: If college_name column has not been added to Supabase yet (PGRST204),
  // retry without college_name so participant submission is not blocked.
  if (insertError && insertError.code === "PGRST204" && trimmedCollege) {
    console.warn("college_name column not found in Supabase schema cache, retrying without it...");
    delete payload.college_name;
    const retry = await supabase.from("submissions").insert(payload);
    insertError = retry.error;
  }

  if (insertError) {
    // Duplicate submission (Postgres error code 23505)
    if (insertError.code === "23505") {
      // For the poster task, re-submitting = editing the saved link.
      if (isPosterTask) {
        const updatePayload: Record<string, unknown> = {
          answer: finalAnswer,
          link: linkStr || null,
        };
        if (trimmedCollege) {
          updatePayload.college_name = trimmedCollege;
        }

        let { error: updateError } = await supabase
          .from("submissions")
          .update(updatePayload)
          .eq("team_id", trimmedTeamId)
          .eq("member_name_normalized", normalizedName)
          .eq("task_id", taskId);

        // Retry without college_name if the column is missing in the schema cache.
        if (updateError && updateError.code === "PGRST204" && trimmedCollege) {
          delete updatePayload.college_name;
          const retry = await supabase
            .from("submissions")
            .update(updatePayload)
            .eq("team_id", trimmedTeamId)
            .eq("member_name_normalized", normalizedName)
            .eq("task_id", taskId);
          updateError = retry.error;
        }

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, updated: true });
      }

      return NextResponse.json(
        { error: "You have already submitted this task" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// In-memory cache for task active status (15-second TTL)
// This dramatically reduces load when hundreds or thousands of students submit simultaneously
const taskActiveCache = new Map<number, { isActive: boolean; expiresAt: number }>();

async function checkTaskIsActive(
  supabase: ReturnType<typeof getSupabase>,
  taskId: number
): Promise<boolean | null> {
  const cached = taskActiveCache.get(taskId);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.isActive;
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, is_active")
    .eq("id", taskId)
    .single();

  if (taskError || !task) {
    return null;
  }

  taskActiveCache.set(taskId, {
    isActive: Boolean(task.is_active),
    expiresAt: now + 15_000, // 15s cache
  });

  return Boolean(task.is_active);
}