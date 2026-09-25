import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { cookies } from "next/headers";
import { resolveTaskRulesAndTemplate } from "@/lib/task-rules";
import fs from "fs";
import path from "path";

// Task 1 ("Share Your Registration Poster") requires LinkedIn post URL (Instagram is optional).
const POSTER_TASK_ID = 1;
const MULTI_LINK_TASK_ID = 2;
const LINK_SUBMISSION_TASK_ID = 3;
const TRACK_SELECTION_TASK_ID = 4;
const POSTER_CAPTION_TASK_ID = 5;

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
  const {
    team_id,
    member_name,
    college_name,
    future_plan,
    answer,
    link,
    instagram_url,
    linkedin_url,
  } = body;

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
  const isMultiLinkTask = taskId === MULTI_LINK_TASK_ID;
  const isLinkSubmissionTask = taskId === LINK_SUBMISSION_TASK_ID;
  const isTrackSelectionTask = taskId === TRACK_SELECTION_TASK_ID;
  const isPosterCaptionTask = taskId === POSTER_CAPTION_TASK_ID;
  const answerStr = answer && typeof answer === "string" ? answer.trim() : "";
  let linkStr = link && typeof link === "string" ? link.trim() : "";

  let instaUrl = (instagram_url && typeof instagram_url === "string" ? instagram_url.trim() : "");
  let linkedUrl = (linkedin_url && typeof linkedin_url === "string" ? linkedin_url.trim() : "");
  const trackId = body.track_id && typeof body.track_id === "number" ? body.track_id : null;

  if (isPosterTask) {
    if (!linkedUrl && linkStr) {
      linkedUrl = linkStr;
    }

    if (!linkedUrl) {
      return NextResponse.json(
        { error: "LinkedIn post URL is required for Task 1" },
        { status: 400 }
      );
    }

    linkStr = linkedUrl;
  } else if (isMultiLinkTask) {
    // Task 2: validate all links are opened
    // We will build the answer automatically from the opened links
  } else if (isLinkSubmissionTask) {
    // Task 3: require a valid URL
    if (!linkStr && !answerStr) {
      return NextResponse.json({ error: "A link URL is required" }, { status: 400 });
    }
    // If they put the link in the answer field, move it
    if (!linkStr && answerStr) {
      linkStr = answerStr;
    }
  } else if (isTrackSelectionTask) {
    // Task 4: require track selection, LinkedIn URL is optional (no validation)
    if (!trackId) {
      return NextResponse.json({ error: "Track selection is required for Task 4" }, { status: 400 });
    }
    // linkedUrl is optional, no format validation
    linkStr = linkedUrl || "";
  } else if (isPosterCaptionTask) {
    // Task 5: require LinkedIn profile URL, Instagram is optional (no format validation)
    if (!linkedUrl) {
      return NextResponse.json(
        { error: "LinkedIn profile URL is required for Task 5" },
        { status: 400 }
      );
    }
    linkStr = linkedUrl;
  } else {
    if (!answerStr && !linkStr) {
      return NextResponse.json({ error: "An answer or link is required" }, { status: 400 });
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

  const cookieStore = await cookies();
  const cookieFuturePlan = cookieStore.get("future_plan")?.value;
  const rawFuturePlan = future_plan || cookieFuturePlan || "";
  const trimmedFuturePlan =
    typeof rawFuturePlan === "string" && rawFuturePlan.trim().length > 0
      ? rawFuturePlan.trim()
      : null;

  let finalAnswer: string;
  if (isPosterTask) {
    finalAnswer = [instaUrl ? `Instagram: ${instaUrl}` : "", linkedUrl ? `LinkedIn: ${linkedUrl}` : ""]
      .filter(Boolean)
      .join("\n");
  } else if (isMultiLinkTask) {
    // For Task 2, validate all links opened and build auto-answer
    const supabaseForLinks = getSupabase();
    // Get the task's configured links
    let taskLinks: { id: string; label: string; url: string }[] = [];
    try {
      const { data: taskData } = await supabaseForLinks
        .from("tasks")
        .select("links")
        .eq("id", taskId)
        .single();
      if (taskData?.links && Array.isArray(taskData.links)) {
        taskLinks = taskData.links;
      }
    } catch {
      // fallback to local config
    }
    if (taskLinks.length === 0) {
      const resolved = resolveTaskRulesAndTemplate({ id: taskId });
      taskLinks = resolved.links;
    }

    if (taskLinks.length > 0) {
      // Get opened link IDs from DB
      const openedIds = new Set<string>();
      try {
        const { data: clicks } = await supabaseForLinks
          .from("task_link_clicks")
          .select("link_id")
          .eq("team_id", trimmedTeamId)
          .eq("member_name_normalized", normalizedName)
          .eq("task_id", taskId);
        if (clicks) {
          for (const c of clicks) openedIds.add(c.link_id);
        }
      } catch {
        // also check local
      }

      // Also check local fallback
      const CLICKS_FILE = path.join(process.cwd(), "data", "task_link_clicks.json");
      try {
        if (fs.existsSync(CLICKS_FILE)) {
          const localClicks = JSON.parse(fs.readFileSync(CLICKS_FILE, "utf-8"));
          for (const c of localClicks) {
            if (
              c.team_id === trimmedTeamId &&
              c.member_name_normalized === normalizedName &&
              c.task_id === taskId
            ) {
              openedIds.add(c.link_id);
            }
          }
        }
      } catch {
        // ignore
      }

      const unopened = taskLinks.filter((l) => !openedIds.has(l.id));
      if (unopened.length > 0) {
        return NextResponse.json(
          { error: `You must open all ${taskLinks.length} links before submitting. ${unopened.length} link(s) remaining.` },
          { status: 400 }
        );
      }
    }

    finalAnswer = answerStr || `All ${taskLinks.length} links opened and verified.`;
  } else if (isLinkSubmissionTask) {
    finalAnswer = answerStr || `Link submitted: ${linkStr}`;
  } else if (isTrackSelectionTask) {
    // For Task 4, answer contains the track name, link contains the LinkedIn URL
    finalAnswer = answerStr || `Track selected`;
  } else if (isPosterCaptionTask) {
    // For Task 5, answer contains the Instagram and LinkedIn URLs
    finalAnswer = [instaUrl ? `Instagram: ${instaUrl}` : "", linkedUrl ? `LinkedIn: ${linkedUrl}` : ""]
      .filter(Boolean)
      .join("\n");
  } else {
    finalAnswer = answerStr;
  }

  const payload: Record<string, unknown> = {
    team_id: trimmedTeamId,
    member_name: trimmedName,
    member_name_normalized: normalizedName,
    task_id: taskId,
    answer: finalAnswer,
    link: linkStr || null,
  };
  if (isTrackSelectionTask && trackId) {
    payload.track_id = trackId;
  }
  if (trimmedCollege) {
    payload.college_name = trimmedCollege;
  }
  if (trimmedFuturePlan) {
    payload.future_plan = trimmedFuturePlan;
  }

  let { error: insertError } = await supabase.from("submissions").insert(payload);

  // Fallback: If future_plan or college_name column has not been added to Supabase yet (PGRST204),
  // retry without missing columns so participant submission is not blocked.
  if (insertError && (insertError.code === "PGRST204" || insertError.message?.includes("future_plan")) && trimmedFuturePlan) {
    console.warn("future_plan column not found in Supabase schema cache, retrying without it...");
    delete payload.future_plan;
    const retry = await supabase.from("submissions").insert(payload);
    insertError = retry.error;
  }
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
        if (trimmedFuturePlan) {
          updatePayload.future_plan = trimmedFuturePlan;
        }

        let { error: updateError } = await supabase
          .from("submissions")
          .update(updatePayload)
          .eq("team_id", trimmedTeamId)
          .eq("member_name_normalized", normalizedName)
          .eq("task_id", taskId);

        if (updateError && (updateError.code === "PGRST204" || updateError.message?.includes("future_plan")) && trimmedFuturePlan) {
          delete updatePayload.future_plan;
          const retry = await supabase
            .from("submissions")
            .update(updatePayload)
            .eq("team_id", trimmedTeamId)
            .eq("member_name_normalized", normalizedName)
            .eq("task_id", taskId);
          updateError = retry.error;
        }

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

      // For Task 4, allow updating track selection and LinkedIn URL
      if (isTrackSelectionTask) {
        const updatePayload: Record<string, unknown> = {
          answer: finalAnswer,
          link: linkStr || null,
          track_id: trackId,
        };
        if (trimmedCollege) {
          updatePayload.college_name = trimmedCollege;
        }
        if (trimmedFuturePlan) {
          updatePayload.future_plan = trimmedFuturePlan;
        }

        let { error: updateError } = await supabase
          .from("submissions")
          .update(updatePayload)
          .eq("team_id", trimmedTeamId)
          .eq("member_name_normalized", normalizedName)
          .eq("task_id", taskId);

        if (updateError && (updateError.code === "PGRST204" || updateError.message?.includes("future_plan")) && trimmedFuturePlan) {
          delete updatePayload.future_plan;
          const retry = await supabase
            .from("submissions")
            .update(updatePayload)
            .eq("team_id", trimmedTeamId)
            .eq("member_name_normalized", normalizedName)
            .eq("task_id", taskId);
          updateError = retry.error;
        }

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

      // For Task 5, allow updating Instagram/LinkedIn profile URLs
      if (isPosterCaptionTask) {
        const updatePayload: Record<string, unknown> = {
          answer: finalAnswer,
          link: linkStr || null,
        };
        if (trimmedCollege) {
          updatePayload.college_name = trimmedCollege;
        }
        if (trimmedFuturePlan) {
          updatePayload.future_plan = trimmedFuturePlan;
        }

        let { error: updateError } = await supabase
          .from("submissions")
          .update(updatePayload)
          .eq("team_id", trimmedTeamId)
          .eq("member_name_normalized", normalizedName)
          .eq("task_id", taskId);

        if (updateError && (updateError.code === "PGRST204" || updateError.message?.includes("future_plan")) && trimmedFuturePlan) {
          delete updatePayload.future_plan;
          const retry = await supabase
            .from("submissions")
            .update(updatePayload)
            .eq("team_id", trimmedTeamId)
            .eq("member_name_normalized", normalizedName)
            .eq("task_id", taskId);
          updateError = retry.error;
        }

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