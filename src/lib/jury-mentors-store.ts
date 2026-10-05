import fs from "fs";
import path from "path";
import { getSupabase } from "./supabase-server";

export interface JuryMentorEntry {
  id: string;
  role: "jury" | "mentor";
  name: string;
  designation: string;
  bio?: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string; // Unique slug or device identifier
  created_at: string;
  updated_at: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "jury_mentors.json");

function ensureDataFile(): JuryMentorEntry[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
    // Attempt creation only if writable environment
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, "[]", "utf-8");
    } catch {
      // In read-only serverless environment (e.g. Vercel), ignore local file creation
    }
    return [];
  } catch {
    return [];
  }
}

function saveDataFile(entries: JuryMentorEntry[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err: any) {
    if (err?.code !== "EROFS") {
      console.warn("Could not write local jury_mentors.json backup:", err?.message || err);
    }
  }
}

/**
 * Retrieves all Jury and Mentor entries.
 * Merges Supabase and local storage deduplicating strictly by primary key ID.
 * Other entries are NEVER overwritten or discarded.
 */
export async function getAllJuryMentors(): Promise<JuryMentorEntry[]> {
  const localEntries = ensureDataFile();

  // Try Supabase sync if available
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("jury_mentors")
      .select("id, role, name, designation, bio, original_photo_url, poster_url, identifier, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      // Map keyed STRICTLY by primary key ID to avoid replacing entries
      const map = new Map<string, JuryMentorEntry>();

      // Load local entries first
      for (const entry of localEntries) {
        if (entry.id) {
          map.set(String(entry.id), entry);
        }
      }

      // Merge with remote Supabase records
      for (const item of data) {
        const strId = String(item.id);
        map.set(strId, {
          id: strId,
          role: item.role,
          name: item.name,
          designation: item.designation,
          bio: item.bio || "",
          original_photo_url: item.original_photo_url || "",
          poster_url: item.poster_url || "",
          identifier: item.identifier || `jm_${strId}`,
          created_at: item.created_at,
          updated_at: item.updated_at || item.created_at,
        });
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Keep local backup synchronized
      if (merged.length > localEntries.length) {
        saveDataFile(merged);
      }

      return merged;
    }
  } catch {
    // Supabase unavailable; fallback to local
  }

  return localEntries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getJuryMentorById(id: string): Promise<JuryMentorEntry | null> {
  const entries = await getAllJuryMentors();
  const trimmed = String(id).trim();
  return entries.find((e) => String(e.id) === trimmed) || null;
}

export async function getJuryMentorByIdentifier(identifier: string): Promise<JuryMentorEntry | null> {
  const entries = await getAllJuryMentors();
  const trimmed = identifier.trim().toLowerCase();
  return entries.find((e) => e.identifier.trim().toLowerCase() === trimmed) || null;
}

/**
 * Saves a Jury or Mentor entry.
 * SAFEGUARD:
 * - If `params.id` is provided, this performs an UPDATE strictly on the row with that ID.
 *   Other entries in DB/local list are NEVER touched or replaced.
 * - If `params.id` is NOT provided, a new unique ID and unique identifier are generated,
 *   performing an INSERT.
 */
export async function saveJuryMentorEntry(params: {
  id?: string;
  role: "jury" | "mentor";
  name: string;
  designation: string;
  bio?: string;
  original_photo_url: string;
  poster_url: string;
  identifier?: string;
}): Promise<JuryMentorEntry> {
  const localEntries = ensureDataFile();
  const now = new Date().toISOString();
  const targetId = params.id ? String(params.id).trim() : null;

  let existingIdx = -1;
  if (targetId) {
    existingIdx = localEntries.findIndex((e) => String(e.id) === targetId);
  }

  let savedEntry: JuryMentorEntry;

  if (targetId && existingIdx >= 0) {
    // === EDIT MODE: UPDATE TARGET ROW ONLY ===
    const prev = localEntries[existingIdx];
    savedEntry = {
      ...prev,
      role: params.role,
      name: params.name.trim(),
      designation: params.designation.trim(),
      bio: params.bio !== undefined ? params.bio.trim() : prev.bio,
      original_photo_url: params.original_photo_url || prev.original_photo_url,
      poster_url: params.poster_url || prev.poster_url,
      updated_at: now,
    };
    localEntries[existingIdx] = savedEntry;
  } else {
    // === NEW MODE: INSERT BRAND NEW ROW ===
    const newId = targetId || `jm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const basePrefix = params.identifier?.trim() || "dev";
    // Ensure every single entry gets a unique identifier so Supabase unique constraint never fails
    const newIdentifier = `${basePrefix.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    savedEntry = {
      id: newId,
      role: params.role,
      name: params.name.trim(),
      designation: params.designation.trim(),
      bio: params.bio?.trim() || "",
      original_photo_url: params.original_photo_url,
      poster_url: params.poster_url,
      identifier: newIdentifier,
      created_at: now,
      updated_at: now,
    };
    localEntries.unshift(savedEntry);
  }

  saveDataFile(localEntries);

  // Sync to Supabase with precise WHERE id = targetId or INSERT
  try {
    const supabase = getSupabase();

    if (targetId && /^\d+$/.test(targetId)) {
      // Numerical Supabase ID: UPDATE ONLY that row
      const numId = parseInt(targetId, 10);
      const { error: updateErr } = await supabase
        .from("jury_mentors")
        .update({
          role: savedEntry.role,
          name: savedEntry.name,
          designation: savedEntry.designation,
          bio: savedEntry.bio || null,
          original_photo_url: savedEntry.original_photo_url,
          poster_url: savedEntry.poster_url,
          updated_at: now,
        })
        .eq("id", numId);

      if (updateErr) {
        console.error("Supabase update error:", updateErr);
      }
    } else {
      // New record: INSERT with fresh unique identifier
      const { data: inserted, error: insertErr } = await supabase
        .from("jury_mentors")
        .insert({
          role: savedEntry.role,
          name: savedEntry.name,
          designation: savedEntry.designation,
          bio: savedEntry.bio || null,
          original_photo_url: savedEntry.original_photo_url,
          poster_url: savedEntry.poster_url,
          identifier: savedEntry.identifier,
          created_at: savedEntry.created_at,
          updated_at: now,
        })
        .select("id")
        .single();

      if (!insertErr && inserted?.id) {
        const serialId = String(inserted.id);
        savedEntry.id = serialId;
        const idx = localEntries.findIndex((e) => e.identifier === savedEntry.identifier);
        if (idx >= 0) {
          localEntries[idx].id = serialId;
          saveDataFile(localEntries);
        }
      } else if (insertErr) {
        console.error("Supabase insert error:", insertErr);
      }
    }
  } catch (err) {
    console.error("Supabase sync non-fatal error:", err);
  }

  return savedEntry;
}

export async function deleteJuryMentorEntry(id: string): Promise<boolean> {
  const localEntries = ensureDataFile();
  const targetId = String(id).trim();

  // Remove strictly from local array
  const updated = localEntries.filter((e) => String(e.id) !== targetId);
  saveDataFile(updated);

  try {
    const supabase = getSupabase();
    if (/^\d+$/.test(targetId)) {
      await supabase.from("jury_mentors").delete().eq("id", parseInt(targetId, 10));
    } else {
      await supabase.from("jury_mentors").delete().eq("identifier", targetId);
    }
  } catch (err) {
    console.error("Supabase delete non-fatal error:", err);
  }

  return true;
}
