import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { User, SchedulerProfile, NotificationPrefs } from "@/lib/types";

export function useSettingsProfile() {
  return useQuery({
    queryKey: queryKeys.settingsProfile,
    queryFn: () => api.get<{ user: User }>("/api/settings/profile").then((r) => r.user),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<User>) =>
      api.patch<{ user: User }>("/api/settings/profile", patch).then((r) => r.user),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settingsProfile }),
  });
}

export function useSettingsAI() {
  return useQuery({
    queryKey: queryKeys.settingsAI,
    queryFn: () =>
      api.get<{ schedulerProfile: SchedulerProfile }>("/api/settings/ai").then((r) => r.schedulerProfile),
  });
}

export function useUpdateAISettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SchedulerProfile>) =>
      api.patch<{ schedulerProfile: SchedulerProfile }>("/api/settings/ai", patch).then((r) => r.schedulerProfile),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settingsAI });
      qc.invalidateQueries({ queryKey: queryKeys.settingsSchedule });
    },
  });
}

export function useSettingsSchedule() {
  return useQuery({
    queryKey: queryKeys.settingsSchedule,
    queryFn: () =>
      api.get<{ schedulerProfile: SchedulerProfile }>("/api/settings/schedule").then((r) => r.schedulerProfile),
  });
}

export function useUpdateScheduleSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SchedulerProfile>) =>
      api
        .patch<{ schedulerProfile: SchedulerProfile }>("/api/settings/schedule", patch)
        .then((r) => r.schedulerProfile),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settingsSchedule });
      qc.invalidateQueries({ queryKey: queryKeys.settingsAI });
    },
  });
}

export function useSettingsNotifications() {
  return useQuery({
    queryKey: queryKeys.settingsNotifications,
    queryFn: () =>
      api
        .get<{ notificationPrefs: NotificationPrefs }>("/api/settings/notifications")
        .then((r) => r.notificationPrefs),
  });
}

export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<NotificationPrefs>) =>
      api
        .patch<{ notificationPrefs: NotificationPrefs }>("/api/settings/notifications", patch)
        .then((r) => r.notificationPrefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settingsNotifications }),
  });
}
