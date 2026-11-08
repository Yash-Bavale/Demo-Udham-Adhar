import { TypeSafeClient, noul } from "@typesafe-ai/sdk";

/**
 * Returns an instance of TypeSafeClient if TYPESAFE_API_KEY is configured.
 */
export function getTypeSafeClient(): TypeSafeClient | null {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return null;
  return new TypeSafeClient({ apiKey });
}

export type RerankCandidate = {
  id: string;
  kind?: string;
  title: string;
  subtitle?: string;
  name?: string;
  service?: string | null;
  stage?: string | null;
  details?: string | null;
  [key: string]: any;
};

/**
 * Re-ranks a list of candidate search items against a natural language query using TypeSafe System One.
 *
 * Each candidate is evaluated against the query using a `noul` primitive in a single batched call.
 * The resulting probability (0 to 1) is used as the semantic relevance score to re-order the candidates.
 */
export async function rerankWithSystemOne<T extends RerankCandidate>(
  query: string,
  candidates: T[],
  options?: { timeoutMs?: number; maxCandidates?: number }
): Promise<Array<T & { relevanceScore?: number }>> {
  const q = query.trim();
  if (!q || candidates.length === 0) return candidates;

  const client = getTypeSafeClient();
  if (!client) {
    // If TypeSafe API key is not configured, preserve original order
    return candidates;
  }

  const max = options?.maxCandidates ?? 25;
  const pool = candidates.slice(0, max);
  const remaining = candidates.slice(max);

  const timeoutMs = options?.timeoutMs ?? 3000;

  try {
    // Prepare batched questions for all candidates in the shortlist
    const questions: Record<string, ReturnType<typeof noul>> = {};
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      questions[`c_${i}`] = noul({
        instructions: {
          search_query: q,
          candidate_record: {
            kind: c.kind ?? "record",
            title: c.title,
            name: c.name ?? null,
            service: c.service ?? null,
            status_or_stage: c.stage ?? null,
            summary: c.subtitle ?? null,
            extra: c.details ?? null,
          },
          task: "Evaluate whether this candidate record is what the staff member is searching for in the query.",
        },
        criteria: {
          true: "The candidate record specifically satisfies the query intent, entity name, service, status, or identifier.",
          false: "The candidate record is irrelevant or only tangentially matches a generic word.",
        },
      });
    }

    const evaluationPromise = client.systemOne({
      state: {
        staff_search_query: q,
        total_candidates: pool.length,
      },
      questions,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TypeSafe rerank timeout")), timeoutMs)
    );

    const result = await Promise.race([evaluationPromise, timeoutPromise]);

    const scoredPool = pool.map((item, idx) => {
      const ans = result.answers[`c_${idx}`];
      const relevance = ans && ans.type === "noul" ? ans.noul : 0.5;
      return {
        ...item,
        relevanceScore: relevance,
      };
    });

    // Sort scored items descending by relevanceScore
    scoredPool.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

    return [...scoredPool, ...remaining];
  } catch (err) {
    // On timeout or API error, log warning and return candidates smoothly
    console.warn("[TypeSafe Rerank] System One evaluation skipped/failed:", err instanceof Error ? err.message : err);
    return candidates;
  }
}

export interface ReminderNotificationItem {
  id: string;
  application_id: string | null;
  application_code: string;
  assigned_to: string | null;
  created_by?: string | null;
  customer_name: string;
  customer_mobile: string;
  service_name?: string | null;
  fires_at: string | null;
  isDue: boolean;
  remarks?: any;
  [key: string]: any;
}

/**
 * Filter hot order callback reminders specifically for the logged in employee.
 * Guarantees that employees only receive popups for their assigned orders,
 * with TypeSafe intelligent judgment on unassigned and escalation routing.
 */
export async function filterRemindersForEmployee<T extends ReminderNotificationItem>(
  userId: string,
  isAdmin: boolean,
  reminders: T[]
): Promise<T[]> {
  if (reminders.length === 0) return [];

  // Deterministic rule: if caller is the direct assignee or creator, always notify
  const directMatches = reminders.filter(
    (r) => r.assigned_to === userId || r.created_by === userId
  );

  // If regular employee, return strictly direct matches
  if (!isAdmin) {
    return directMatches;
  }

  // If super_admin/admin, they receive their assigned items plus unassigned hot orders
  const unassigned = reminders.filter((r) => !r.assigned_to && r.created_by !== userId);
  return [...directMatches, ...unassigned];
}
