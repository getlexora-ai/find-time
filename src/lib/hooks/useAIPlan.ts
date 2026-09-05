import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { PlanDraft, AISuggestion, ConflictReport, CalendarEvent } from "@/lib/types";

export interface PlanResult {
  draft: PlanDraft;
  suggestions: AISuggestion[];
  events: CalendarEvent[];
  conflicts: ConflictReport[];
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskIds?: string[]) => api.post<PlanResult>("/api/ai/plan", { taskIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

export function useDrafts() {
  return useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.get<{ drafts: PlanDraft[] }>("/api/drafts").then((r) => r.drafts),
  });
}

export function useDraft(id: string | null) {
  return useQuery({
    queryKey: ["drafts", id],
    queryFn: () => api.get<{ draft: PlanDraft; suggestions: AISuggestion[] }>(`/api/drafts/${id}`),
    enabled: !!id,
  });
}

export function useApplyDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ draft: PlanDraft }>(`/api/drafts/${id}/apply`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

export function useDiscardDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ draft: PlanDraft }>(`/api/drafts/${id}/discard`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}

export function useUndoDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ draft: PlanDraft }>(`/api/drafts/${id}/undo`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.events });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    },
  });
}
