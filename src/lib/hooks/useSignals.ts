import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { EmailSignal, Task } from "@/lib/types";

export function useSignals() {
  return useQuery({
    queryKey: queryKeys.signals,
    queryFn: () => api.get<{ signals: EmailSignal[] }>("/api/signals").then((r) => r.signals),
  });
}

export function useAcceptSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ task: Task }>(`/api/signals/${id}/accept`).then((r) => r.task),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.signals });
      qc.invalidateQueries({ queryKey: queryKeys.tasks });
    },
  });
}

export function useIgnoreSignal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/signals/${id}/ignore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.signals }),
  });
}
