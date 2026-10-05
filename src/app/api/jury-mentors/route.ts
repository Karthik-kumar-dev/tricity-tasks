import { NextRequest, NextResponse } from "next/server";
import { getJuryMentorByIdentifier, saveJuryMentorEntry } from "@/lib/jury-mentors-store";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const identifier = searchParams.get("identifier");

  if (!identifier) {
    return NextResponse.json({ error: "Missing identifier parameter" }, { status: 400 });
  }

  try {
    const entry = await getJuryMentorByIdentifier(identifier);
    return NextResponse.json({ entry });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch entry" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role, name, designation, original_photo, poster_image, identifier } = body;

    if (!role || (role !== "jury" && role !== "mentor")) {
      return NextResponse.json({ error: "Please select a valid role (Jury or Mentor)." }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }
    if (!designation || !designation.trim()) {
      return NextResponse.json({ error: "Designation / Organisation is required." }, { status: 400 });
    }
    if (!identifier || !identifier.trim()) {
      return NextResponse.json({ error: "Identifier is required." }, { status: 400 });
    }

    // Save base64 images to static files if needed, or keep as optimized data URLs
    let photoUrl = original_photo || "";
    let posterUrl = poster_image || "";

    // If images are data URLs, optionally write to public/uploads/jury-mentors/
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "jury-mentors");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const safeId = identifier.replace(/[^a-zA-Z0-9_-]/g, "_");
    const timestamp = Date.now();

    if (original_photo && original_photo.startsWith("data:image/")) {
      try {
        const matches = original_photo.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          const filename = `${safeId}_photo_${timestamp}.${ext}`;
          const filepath = path.join(uploadsDir, filename);
          fs.writeFileSync(filepath, buffer);
          photoUrl = `/uploads/jury-mentors/${filename}`;
        }
      } catch (err) {
        console.error("Failed to write photo file to disk:", err);
      }
    }

    if (poster_image && poster_image.startsWith("data:image/")) {
      try {
        const matches = poster_image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const buffer = Buffer.from(matches[2], "base64");
          const filename = `${safeId}_poster_${timestamp}.png`;
          const filepath = path.join(uploadsDir, filename);
          fs.writeFileSync(filepath, buffer);
          posterUrl = `/uploads/jury-mentors/${filename}`;
        }
      } catch (err) {
        console.error("Failed to write poster file to disk:", err);
      }
    }

    const saved = await saveJuryMentorEntry({
      role,
      name: name.trim(),
      designation: designation.trim(),
      original_photo_url: photoUrl,
      poster_url: posterUrl,
      identifier: identifier.trim(),
    });

    return NextResponse.json({ success: true, entry: saved });
  } catch (err: any) {
    console.error("Jury & Mentor submission error:", err);
    return NextResponse.json({ error: err.message || "Failed to process submission" }, { status: 500 });
  }
}
