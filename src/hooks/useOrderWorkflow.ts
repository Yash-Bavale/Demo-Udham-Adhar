// Single source of truth for the workflow engine state of one order.
// Wraps getWorkflowState with a 15s refetch + focus refetch, and exposes the
// derived EngineView so callers don't repeat the parsing logic.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { getWorkflowState } from "@/lib/workflow/engine.functions";
import { deriveEngineView, type EngineView } from "@/lib/workflow/engine-view";

export interface UseOrderWorkflowResult {
  isLoading: boolean;
  view: EngineView;
  events: any[];
  refetch: () => void;
  queryKey: readonly unknown[];
}

export function useOrderWorkflow(applicationId: string | null | undefined): UseOrderWorkflowResult {
  const qc = useQueryClient();
  const fn = useServerFn(getWorkflowState);
  const key = ["order-workflow-state", applicationId] as const;

  const q = useQuery({
    queryKey: key,
    enabled: !!applicationId,
    queryFn: () => fn({ data: { applicationId: applicationId! } }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const view = deriveEngineView({
    state: q.data?.state,
    timers: q.data?.timers,
    automations: q.data?.automations,
  });

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: key });
  }, [qc, key]);

  return {
    isLoading: q.isLoading,
    view,
    events: q.data?.events ?? [],
    refetch,
    queryKey: key,
  };
}
