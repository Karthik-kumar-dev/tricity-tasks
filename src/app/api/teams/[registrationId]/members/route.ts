import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ registrationId: string }> }
) {
  try {
    const { registrationId } = await params;
    const cleanId = (decodeURIComponent(registrationId) || "").trim();

    if (!cleanId) {
      return NextResponse.json({ error: "Registration ID is required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Match registration_id case-insensitively
    const { data, error } = await supabase
      .from("registrations")
      .select("member_name, role, registration_id, team_name")
      .ilike("registration_id", cleanId)
      .order("id", { ascending: true });

    if (error) {
      console.warn("Error fetching members:", error.message);
      return NextResponse.json({ members: [] });
    }

    const members = (data || []).map((row) => ({
      member_name: (row.member_name || "").trim(),
      role: (row.role || "").trim(),
    }));

    return NextResponse.json({
      registration_id: cleanId,
      team_name: data?.[0]?.team_name || "",
      members,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch members";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
