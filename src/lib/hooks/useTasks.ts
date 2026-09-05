import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { Task } from "@/lib/types";

export function useTasks() {
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: () => api.get<{ tasks: Task[] }>("/api/tasks").then((r) => r.tasks),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Task> & { title: string }) =>
      api.post<{ task: Task }>("/api/tasks", data).then((r) => r.task),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) =>
      api.patch<{ task: Task }>(`/api/tasks/${id}`, patch).then((r) => r.task),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.tasks });
      const previous = qc.getQueryData<Task[]>(queryKeys.tasks);
      if (previous) {
        qc.setQueryData<Task[]>(
          queryKeys.tasks,
          previous.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.tasks, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tasks }),
  });
}
