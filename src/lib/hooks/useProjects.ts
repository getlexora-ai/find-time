import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { Project } from "@/lib/types";

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.get<{ projects: Project[] }>("/api/projects").then((r) => r.projects),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Project> & { name: string }) =>
      api.post<{ project: Project }>("/api/projects", data).then((r) => r.project),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
}
