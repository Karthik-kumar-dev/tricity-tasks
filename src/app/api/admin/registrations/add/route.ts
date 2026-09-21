import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

interface NewRegistration {
  registration_id: string;
  team_name: string;
  role: string;
  member_name: string;
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { registration_id, team_name, role, member_name } = body;

    const cleanRegId = (registration_id || "").trim().toUpperCase();
    const cleanName = (member_name || "").trim();
    let cleanTeamName = (team_name || "").trim();
    let cleanRole = (role || "").trim();

    if (!cleanRegId) {
      return NextResponse.json(
        { error: "Registration ID is required" },
        { status: 400 }
      );
    }

    if (!cleanName) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // If team name is missing, check if this registration_id already exists and reuse its team_name
    if (!cleanTeamName) {
      const { data: existingTeam } = await supabase
        .from("registrations")
        .select("team_name")
        .ilike("registration_id", cleanRegId)
        .limit(1);

      if (existingTeam && existingTeam[0]?.team_name) {
        cleanTeamName = existingTeam[0].team_name;
      } else {
        cleanTeamName = cleanRegId;
      }
    }

    // If role is missing, determine an available role
    if (!cleanRole) {
      const { data: existingMembers } = await supabase
        .from("registrations")
        .select("role")
        .ilike("registration_id", cleanRegId);

      const existingRoles = new Set((existingMembers || []).map((m) => (m.role || "").toLowerCase()));
      if (!existingRoles.has("leader") && !existingRoles.has("team leader")) {
        cleanRole = "Leader";
      } else if (!existingRoles.has("member")) {
        cleanRole = "Member";
      } else {
        let i = 1;
        while (existingRoles.has(`member ${i}`)) {
          i++;
        }
        cleanRole = `Member ${i}`;
      }
    }

    // Check if a registration with this ID and role already exists
    const { data: existing, error: checkError } = await supabase
      .from("registrations")
      .select("id, member_name")
      .ilike("registration_id", cleanRegId)
      .ilike("role", cleanRole);

    if (checkError) {
      return NextResponse.json(
        { error: checkError.message },
        { status: 500 }
      );
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: `A user with role "${cleanRole}" already exists for team ${cleanRegId} (${existing[0].member_name}). Please specify a distinct role (e.g. Member 2).`,
        },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from("registrations").insert({
      registration_id: cleanRegId,
      team_name: cleanTeamName,
      role: cleanRole,
      member_name: cleanName,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            error: `Registration ID "${cleanRegId}" with role "${cleanRole}" already exists. Please choose a different role name.`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: `Failed to insert registration: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      registration_id: cleanRegId,
      team_name: cleanTeamName,
      role: cleanRole,
      member_name: cleanName,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to add registration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}