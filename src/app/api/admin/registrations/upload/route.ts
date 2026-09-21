import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-server";
import { verifyAdmin } from "@/lib/auth";

interface ParsedRow {
  registration_id: string;
  team_name: string;
  role: string;
  member_name: string;
}

// Simple RFC 4180 compliant CSV line parser supporting quoted cells and commas
function parseCsv(csvText: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        insideQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && nextChar === "\n") {
          i++; // skip \n
        }
        currentRow.push(currentCell.trim());
        currentCell = "";
        if (currentRow.some((c) => c.length > 0)) {
          lines.push(currentRow);
        }
        currentRow = [];
      } else {
        currentCell += char;
      }
    }
  }

  // Push final cell/row if present
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], records: [] };
  }

  const rawHeaders = lines[0];
  const records: Record<string, string>[] = [];

  for (let r = 1; r < lines.length; r++) {
    const row = lines[r];
    const record: Record<string, string> = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      record[rawHeaders[c]] = row[c] !== undefined ? row[c].trim() : "";
    }
    records.push(record);
  }

  return { headers: rawHeaders, records };
}

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let csvContent = "";

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No CSV file provided" }, { status: 400 });
      }
      csvContent = await file.text();
    } else {
      const body = await request.json();
      csvContent = body.csvText || "";
    }

    if (!csvContent || csvContent.trim().length === 0) {
      return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
    }

    const { headers, records } = parseCsv(csvContent);

    if (headers.length === 0) {
      return NextResponse.json({ error: "CSV does not contain any headers" }, { status: 400 });
    }

    // Required headers: "Registration ID", "Team Name", "Role", "Name"
    // Match by header name, case-insensitively and trimmed
    const findHeader = (target: string): string | undefined => {
      const normTarget = target.toLowerCase().replace(/[\s_-]+/g, "");
      return headers.find(
        (h) => h.toLowerCase().replace(/[\s_-]+/g, "") === normTarget
      );
    };

    const regIdHeader = findHeader("Registration ID") || findHeader("RegistrationID");
    const teamNameHeader = findHeader("Team Name") || findHeader("TeamName");
    const roleHeader = findHeader("Role");
    const nameHeader = findHeader("Name") || findHeader("Member Name") || findHeader("MemberName");

    // Check which required header is missing
    if (!regIdHeader) {
      return NextResponse.json(
        { error: 'Missing required header: "Registration ID"' },
        { status: 400 }
      );
    }
    if (!teamNameHeader) {
      return NextResponse.json(
        { error: 'Missing required header: "Team Name"' },
        { status: 400 }
      );
    }
    if (!roleHeader) {
      return NextResponse.json(
        { error: 'Missing required header: "Role"' },
        { status: 400 }
      );
    }
    if (!nameHeader) {
      return NextResponse.json(
        { error: 'Missing required header: "Name"' },
        { status: 400 }
      );
    }

    const validRows: ParsedRow[] = [];
    const seenKeys = new Set<string>();
    let skippedCount = 0;
    const distinctTeams = new Set<string>();

    for (const record of records) {
      const regId = (record[regIdHeader] || "").trim();
      const teamName = (record[teamNameHeader] || "").trim();
      const role = (record[roleHeader] || "").trim();
      const memberName = (record[nameHeader] || "").trim();

      // Skip blank rows or rows missing Registration ID or Name
      if (!regId || !memberName) {
        skippedCount++;
        continue;
      }

      // Unique constraint on (registration_id, role)
      const uniqueKey = `${regId.toLowerCase()}:::${role.toLowerCase()}`;
      if (seenKeys.has(uniqueKey)) {
        // Skip duplicate within the same CSV
        skippedCount++;
        continue;
      }
      seenKeys.add(uniqueKey);

      distinctTeams.add(regId.toLowerCase());
      validRows.push({
        registration_id: regId,
        team_name: teamName,
        role: role,
        member_name: memberName,
      });
    }

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows found to import in the CSV" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Execute in ONE atomic transaction via RPC replace_registrations
    const rpcResult = await supabase.rpc("replace_registrations", {
      rows: validRows,
    });

    if (rpcResult.error) {
      console.warn("RPC replace_registrations error or not found, falling back to delete + insert:", rpcResult.error.message);

      // Fallback: Delete all then insert in chunks
      const { error: delError } = await supabase
        .from("registrations")
        .delete()
        .gte("id", 0);

      if (delError) {
        // If table doesn't exist
        if (delError.code === "42P01" || delError.message.includes("does not exist")) {
          return NextResponse.json(
            {
              error:
                'Table "registrations" does not exist in Supabase yet. Please run the schema.sql migration in Supabase SQL Editor.',
            },
            { status: 500 }
          );
        }
        return NextResponse.json({ error: delError.message }, { status: 500 });
      }

      // Insert in batches of 200
      const BATCH_SIZE = 200;
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const { error: insError } = await supabase.from("registrations").insert(batch);
        if (insError) {
          return NextResponse.json(
            { error: `Failed inserting registrations batch: ${insError.message}` },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      inserted: validRows.length,
      skipped: skippedCount,
      team_count: distinctTeams.size,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to upload registrations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
