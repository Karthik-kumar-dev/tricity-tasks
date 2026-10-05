import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/auth";
import {
  getAllJuryMentors,
  deleteJuryMentorEntry,
  saveJuryMentorEntry,
} from "@/lib/jury-mentors-store";
import { getSupabase } from "@/lib/supabase-server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

async function processImage(dataUri: string, prefix: string): Promise<string> {
  if (!dataUri) return "";
  if (!dataUri.startsWith("data:image/")) return dataUri;

  const commaIdx = dataUri.indexOf(",");
  if (commaIdx === -1) return "";

  const header = dataUri.slice(0, commaIdx);
  const base64Data = dataUri.slice(commaIdx + 1);

  let ext = "png";
  let contentType = "image/png";
  if (header.includes("jpeg") || header.includes("jpg")) {
    ext = "jpg";
    contentType = "image/jpeg";
  } else if (header.includes("webp")) {
    ext = "webp";
    contentType = "image/webp";
  }

  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
  const filename = `${safePrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const buffer = Buffer.from(base64Data, "base64");

  // 1. Try uploading to Supabase Storage bucket 'task-posters' (works in serverless / production)
  try {
    const supabase = getSupabase();
    const storagePath = `jury-mentors/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("task-posters")
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from("task-posters")
        .getPublicUrl(storagePath);

      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    } else {
      console.warn("Supabase Storage upload error:", uploadError.message);
    }
  } catch (supabaseErr) {
    console.warn("Supabase Storage upload failed, attempting local fallback:", supabaseErr);
  }

  // 2. Fallback to local filesystem (local dev only)
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "jury-mentors");
    if (!fs.existsSync(uploadsDir)) {
      await fs.promises.mkdir(uploadsDir, { recursive: true });
    }
    const filepath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(filepath, buffer);
    return `/uploads/jury-mentors/${filename}`;
  } catch (fsErr: any) {
    console.error("Local filesystem write failed (read-only environment):", fsErr);
    throw new Error(
      `Failed to upload image. Please verify Supabase Storage configuration. (${fsErr?.message || "Read-only filesystem"})`
    );
  }
}

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
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
          (e.bio && e.bio.toLowerCase().includes(query)) ||
          e.identifier.toLowerCase().includes(query)
      );
    }

    return NextResponse.json({ entries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch entries" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, role, name, designation, bio, original_photo, poster_image, identifier } = body;

    if (!role || (role !== "jury" && role !== "mentor")) {
      return NextResponse.json({ error: "Role must be 'jury' or 'mentor'." }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }
    if (!designation || !designation.trim()) {
      return NextResponse.json({ error: "Designation / Organisation is required." }, { status: 400 });
    }

    const [photoUrl, posterUrl] = await Promise.all([
      processImage(original_photo, `${name.trim()}_photo`),
      processImage(poster_image, `${name.trim()}_poster`),
    ]);

    const saved = await saveJuryMentorEntry({
      id: id ? String(id).trim() : undefined,
      role,
      name: name.trim(),
      designation: designation.trim(),
      bio: bio ? String(bio).trim() : undefined,
      original_photo_url: photoUrl,
      poster_url: posterUrl,
      identifier: identifier ? String(identifier).trim() : undefined,
    });

    return NextResponse.json({ success: true, entry: saved });
  } catch (err: any) {
    console.error("Admin save jury/mentor error:", err);
    return NextResponse.json({ error: err.message || "Failed to save entry" }, { status: 500 });
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
