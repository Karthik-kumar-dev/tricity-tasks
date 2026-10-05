import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth";
import { getAllJuryMentors, deleteJuryMentorEntry } from "@/lib/jury-mentors-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role"); // 'jury', 'mentor', or null for all
    const query = searchParams.get("q")?.toLowerCase();

    let entries = await getAllJuryMentors();

    if (role && (role === "jury" || role === "mentor")) {
      entries = entries.filter((e) => e.role === role);
    }

    if (query) {
      entries = entries.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.designation.toLowerCase().includes(query) ||
          e.identifier.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch entries" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing entry ID" }, { status: 400 });
    }

    await deleteJuryMentorEntry(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete entry" }, { status: 500 });
  }
}
