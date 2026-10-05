import { NextRequest, NextResponse } from "next/server";
import {
  getJuryMentorById,
  getJuryMentorByIdentifier,
  saveJuryMentorEntry,
} from "@/lib/jury-mentors-store";
import { getSupabase } from "@/lib/supabase-server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Saves a base64 data URI to Supabase Storage (with local disk fallback for dev).
 * If dataUri is already a persistent URL, returns it immediately without re-uploading.
 */
async function processImage(dataUri: string, prefix: string): Promise<string> {
  if (!dataUri) return "";

  // If already a saved URL, reuse it directly (skips re-uploading)
  if (!dataUri.startsWith("data:image/")) {
    return dataUri;
  }

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
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const identifier = searchParams.get("identifier");

  try {
    if (id) {
      const entry = await getJuryMentorById(id);
      return NextResponse.json({ entry });
    }
    if (identifier) {
      const entry = await getJuryMentorByIdentifier(identifier);
      return NextResponse.json({ entry });
    }
    return NextResponse.json({ error: "Missing id or identifier parameter" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch entry" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, role, name, designation, bio, original_photo, poster_image, identifier } = body;

    if (!role || (role !== "jury" && role !== "mentor")) {
      return NextResponse.json({ error: "Please select a valid role (Jury or Mentor)." }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Full Name is required." }, { status: 400 });
    }
    if (!designation || !designation.trim()) {
      return NextResponse.json({ error: "Designation / Organisation is required." }, { status: 400 });
    }

    // Process images in parallel and avoid re-uploading unchanged assets
    const [photoUrl, posterUrl] = await Promise.all([
      processImage(original_photo, `${name.trim()}_photo`),
      processImage(poster_image, `${name.trim()}_poster`),
    ]);

    // Save with explicit ID target (UPDATE) or as new (INSERT)
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
    console.error("Jury & Mentor submission error:", err);
    return NextResponse.json({ error: err.message || "Failed to process submission" }, { status: 500 });
  }
}
