import fs from "fs";
import path from "path";
import { getSupabase } from "./supabase-server";

export interface JuryMentorEntry {
  id: string;
  role: "jury" | "mentor";
  name: string;
  designation: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string; // Team ID, device ID, or user identifier
  created_at: string;
  updated_at: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "jury_mentors.json");

function ensureDataFile(): JuryMentorEntry[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, "[]", "utf-8");
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading jury_mentors.json:", err);
    return [];
  }
}

function saveDataFile(entries: JuryMentorEntry[]) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing jury_mentors.json:", err);
  }
}

export async function getAllJuryMentors(): Promise<JuryMentorEntry[]> {
  const localEntries = ensureDataFile();

  // Try Supabase sync if available
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("jury_mentors")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      // Merge unique entries by identifier
      const map = new Map<string, JuryMentorEntry>();
      for (const entry of localEntries) {
        map.set(entry.identifier, entry);
      }
      for (const item of data) {
        map.set(item.identifier, {
          id: String(item.id),
          role: item.role,
          name: item.name,
          designation: item.designation,
          original_photo_url: item.original_photo_url || "",
          poster_url: item.poster_url || "",
          identifier: item.identifier,
          created_at: item.created_at,
          updated_at: item.updated_at || item.created_at,
        });
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  } catch {
    // Supabase unavailable or table doesn't exist yet; fallback to local
  }

  return localEntries.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getJuryMentorByIdentifier(identifier: string): Promise<JuryMentorEntry | null> {
  const entries = await getAllJuryMentors();
  const trimmed = identifier.trim().toLowerCase();
  return entries.find((e) => e.identifier.trim().toLowerCase() === trimmed) || null;
}

export async function saveJuryMentorEntry(params: {
  role: "jury" | "mentor";
  name: string;
  designation: string;
  original_photo_url: string;
  poster_url: string;
  identifier: string;
}): Promise<JuryMentorEntry> {
  const localEntries = ensureDataFile();
  const now = new Date().toISOString();
  const trimmedId = params.identifier.trim();

  const existingIdx = localEntries.findIndex(
    (e) => e.identifier.trim().toLowerCase() === trimmedId.toLowerCase()
  );

  let savedEntry: JuryMentorEntry;

  if (existingIdx >= 0) {
    savedEntry = {
      ...localEntries[existingIdx],
      role: params.role,
      name: params.name,
      designation: params.designation,
      original_photo_url: params.original_photo_url || localEntries[existingIdx].original_photo_url,
      poster_url: params.poster_url || localEntries[existingIdx].poster_url,
      updated_at: now,
    };
    localEntries[existingIdx] = savedEntry;
  } else {
    savedEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: params.role,
      name: params.name,
      designation: params.designation,
      original_photo_url: params.original_photo_url,
      poster_url: params.poster_url,
      identifier: trimmedId,
      created_at: now,
      updated_at: now,
    };
    localEntries.unshift(savedEntry);
  }

  saveDataFile(localEntries);

  // Sync to Supabase in background / best-effort
  try {
    const supabase = getSupabase();
    await supabase.from("jury_mentors").upsert(
      {
        role: savedEntry.role,
        name: savedEntry.name,
        designation: savedEntry.designation,
        original_photo_url: savedEntry.original_photo_url,
        poster_url: savedEntry.poster_url,
        identifier: savedEntry.identifier,
        updated_at: now,
      },
      { onConflict: "identifier" }
    );
  } catch {
    // Supabase failure is non-blocking
  }

  return savedEntry;
}

export async function deleteJuryMentorEntry(idOrIdentifier: string): Promise<boolean> {
  const localEntries = ensureDataFile();
  const updated = localEntries.filter(
    (e) => e.id !== idOrIdentifier && e.identifier.toLowerCase() !== idOrIdentifier.toLowerCase()
  );
  saveDataFile(updated);

  try {
    const supabase = getSupabase();
    await supabase
      .from("jury_mentors")
      .delete()
      .or(`id.eq.${idOrIdentifier},identifier.eq.${idOrIdentifier}`);
  } catch {
    // Non-blocking
  }

  return true;
}
