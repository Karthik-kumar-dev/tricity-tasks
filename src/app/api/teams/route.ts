import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();

    const supabase = getSupabase();
    let query = supabase
      .from("registrations")
      .select("registration_id, team_name")
      .order("registration_id", { ascending: true })
      .limit(100);

    if (q) {
      // Search case-insensitively across registration_id or team_name
      query = query.or(`registration_id.ilike.%${q}%,team_name.ilike.%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      // Table doesn't exist yet or other query error
      console.warn("Error fetching teams from registrations:", error.message);
      return NextResponse.json({ teams: [] });
    }

    if (!data) {
      return NextResponse.json({ teams: [] });
    }

    // Deduplicate distinct teams by registration_id
    const seen = new Set<string>();
    const distinctTeams: { registration_id: string; team_name: string }[] = [];

    for (const row of data) {
      const regId = (row.registration_id || "").trim();
      const lower = regId.toLowerCase();
      if (!lower || seen.has(lower)) continue;
      seen.add(lower);
      distinctTeams.push({
        registration_id: regId,
        team_name: (row.team_name || "").trim(),
      });
      if (distinctTeams.length >= 20) break;
    }

    return NextResponse.json({ teams: distinctTeams });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
