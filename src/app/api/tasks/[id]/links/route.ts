import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const CLICKS_FILE = path.join(process.cwd(), "data", "task_link_clicks.json");

interface ClickRecord {
  team_id: string;
  member_name_normalized: string;
  task_id: number;
  link_id: string;
  created_at: string;
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readLocalClicks(): ClickRecord[] {
  try {
    if (fs.existsSync(CLICKS_FILE)) {
      return JSON.parse(fs.readFileSync(CLICKS_FILE, "utf-8"));
    }
  } catch {
    // ignore
  }
  return [];
}

function writeLocalClicks(clicks: ClickRecord[]) {
  try {
    ensureDir(CLICKS_FILE);
    fs.writeFileSync(CLICKS_FILE, JSON.stringify(clicks, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write local clicks:", err);
  }
}

/**
 * GET /api/tasks/[id]/links?team_id=X&member_name=Y
 * Returns which link_ids the user has already opened for this task.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const url = new URL(request.url);
  const teamId = (url.searchParams.get("team_id") || "").trim().toUpperCase();
  const memberName = (url.searchParams.get("member_name") || "").trim();

  if (!teamId || !memberName) {
    return NextResponse.json({ opened_link_ids: [] });
  }

  const normalizedName = memberName.toLowerCase();
  const openedIds = new Set<string>();

  // Try Supabase first
  const supabase = getSupabase();
  try {
    const { data, error } = await supabase
      .from("task_link_clicks")
      .select("link_id")
      .eq("team_id", teamId)
      .eq("member_name_normalized", normalizedName)
      .eq("task_id", taskId);

    if (!error && data) {
      for (const row of data) {
        openedIds.add(row.link_id);
      }
    }
  } catch {
    // Supabase may not have the table yet; fall through to local
  }

  // Also check local fallback
  const localClicks = readLocalClicks();
  for (const c of localClicks) {
    if (
      c.team_id === teamId &&
      c.member_name_normalized === normalizedName &&
      c.task_id === taskId
    ) {
      openedIds.add(c.link_id);
    }
  }

  return NextResponse.json({ opened_link_ids: Array.from(openedIds) });
}

/**
 * POST /api/tasks/[id]/links
 * Body: { team_id, member_name, link_id }
 * Records a link click. Returns the updated list of opened link_ids.
 */
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
  const teamId = ((body.team_id || "") as string).trim().toUpperCase();
  const memberName = ((body.member_name || "") as string).trim();
  const linkId = ((body.link_id || "") as string).trim();

  if (!teamId || !memberName || !linkId) {
    return NextResponse.json(
      { error: "team_id, member_name, and link_id are required" },
      { status: 400 }
    );
  }

  const normalizedName = memberName.toLowerCase();
  let savedToDb = false;

  // Try to save to Supabase
  const supabase = getSupabase();
  try {
    const { error } = await supabase.from("task_link_clicks").insert({
      team_id: teamId,
      member_name_normalized: normalizedName,
      task_id: taskId,
      link_id: linkId,
    });

    if (error) {
      // 23505 = duplicate, which is fine (already clicked)
      if (error.code === "23505") {
        savedToDb = true;
      } else {
        console.warn("Supabase task_link_clicks insert failed:", error.message);
      }
    } else {
      savedToDb = true;
    }
  } catch {
    // Table may not exist yet; fall through to local
  }

  // Always also save to local fallback
  const localClicks = readLocalClicks();
  const alreadyLocal = localClicks.some(
    (c) =>
      c.team_id === teamId &&
      c.member_name_normalized === normalizedName &&
      c.task_id === taskId &&
      c.link_id === linkId
  );
  if (!alreadyLocal) {
    localClicks.push({
      team_id: teamId,
      member_name_normalized: normalizedName,
      task_id: taskId,
      link_id: linkId,
      created_at: new Date().toISOString(),
    });
    writeLocalClicks(localClicks);
  }

  // Return all opened link_ids for this user+task
  const openedIds = new Set<string>();

  if (savedToDb) {
    try {
      const { data } = await supabase
        .from("task_link_clicks")
        .select("link_id")
        .eq("team_id", teamId)
        .eq("member_name_normalized", normalizedName)
        .eq("task_id", taskId);

      if (data) {
        for (const row of data) {
          openedIds.add(row.link_id);
        }
      }
    } catch {
      // ignore
    }
  }

  // Merge local
  for (const c of localClicks) {
    if (
      c.team_id === teamId &&
      c.member_name_normalized === normalizedName &&
      c.task_id === taskId
    ) {
      openedIds.add(c.link_id);
    }
  }

  return NextResponse.json({
    success: true,
    opened_link_ids: Array.from(openedIds),
  });
}
