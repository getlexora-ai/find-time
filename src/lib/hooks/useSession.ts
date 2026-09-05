import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { User } from "@/lib/types";

const sessionKey = ["auth", "session"] as const;

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () => api.get<{ user: User | null }>("/api/auth/session").then((r) => r.user),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ user: User }>("/api/auth/login").then((r) => r.user),
    onSuccess: (user) => qc.setQueryData(sessionKey, user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => qc.setQueryData(sessionKey, null),
  });
}
