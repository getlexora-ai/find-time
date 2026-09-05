import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { CalendarEvent } from "@/lib/types";

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.events,
    queryFn: () => api.get<{ events: CalendarEvent[] }>("/api/events").then((r) => r.events),
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CalendarEvent>) =>
      api.post<{ event: CalendarEvent }>("/api/events", data).then((r) => r.event),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CalendarEvent> }) =>
      api.patch<{ event: CalendarEvent }>(`/api/events/${id}`, patch).then((r) => r.event),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.events });
      const previous = qc.getQueryData<CalendarEvent[]>(queryKeys.events);
      if (previous) {
        qc.setQueryData<CalendarEvent[]>(
          queryKeys.events,
          previous.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.events, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.events });
      const previous = qc.getQueryData<CalendarEvent[]>(queryKeys.events);
      if (previous) {
        qc.setQueryData<CalendarEvent[]>(
          queryKeys.events,
          previous.filter((e) => e.id !== id),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.events, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}
