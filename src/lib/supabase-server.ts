import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables. Ensure .env.local exists with these variables."
    );
  }

  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  return cachedClient;
}

/**
 * Fetches all rows from a Supabase table by automatically paginating
 * in batches of 1000, overcoming PostgREST's default 1000-row limit.
 * Includes automatic retry with exponential backoff for network resilience.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  applyQuery?: (query: any) => any,
  maxRetries = 3
): Promise<T[]> {
  const pageSize = 1000;
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    let attempts = 0;
    let data: any = null;
    let error: any = null;

    while (attempts < maxRetries) {
      try {
        let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
        if (applyQuery) {
          query = applyQuery(query);
        }
        const res = await query;
        data = res.data;
        error = res.error;
        if (error) {
          throw error;
        }
        break; // Query succeeded
      } catch (err: any) {
        attempts++;
        if (attempts >= maxRetries) {
          throw err;
        }
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, attempts * 500));
      }
    }

    if (!data || data.length === 0) break;
    allRows.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}
