import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { ConnectedAccount, Calendar } from "@/lib/types";

export function useConnections() {
  return useQuery({
    queryKey: queryKeys.connections,
    queryFn: () =>
      api.get<{ accounts: ConnectedAccount[]; calendars: Calendar[] }>("/api/connections"),
  });
}
