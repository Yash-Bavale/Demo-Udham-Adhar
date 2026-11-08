import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Subscribe to postgres_changes for a table. Calls onChange on any INSERT/UPDATE/DELETE.
 *  Channel topics are scoped to the current user (`user:<uid>:...`) so the realtime
 *  policy can restrict subscriptions to that user's own topics. The actual rows
 *  delivered are still gated by the underlying table's RLS. */
export function useRealtimeTable(
  table: string,
  onChange: () => void,
  opts?: { filter?: string; schema?: string }
) {
  useEffect(() => {
    const schema = opts?.schema ?? "public";
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const topic = `user:${uid}:${schema}:${table}:${opts?.filter ?? "all"}:${Math.random()
        .toString(36)
        .slice(2)}`;
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes" as never,
          { event: "*", schema, table, ...(opts?.filter ? { filter: opts.filter } : {}) },
          () => onChange()
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, opts?.filter, opts?.schema]);
}
