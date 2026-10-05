import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth";
import { toggleJuryMentorsActive, isJuryMentorsActive } from "@/lib/jury-mentors-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ is_active: isJuryMentorsActive() });
}

export async function PATCH(_request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const newState = toggleJuryMentorsActive();
  return NextResponse.json({ success: true, is_active: newState });
}
