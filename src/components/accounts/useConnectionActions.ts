"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/queryKeys";
import type { AccountProvider, Calendar, ConnectedAccount } from "@/lib/types";

type ConnectionsData = { accounts: ConnectedAccount[]; calendars: Calendar[] };

/**
 * All mutations for the multi-account manager. This is a day-one simulated
 * OAuth/connections layer: the only real network round-trip is the one
 * `POST /api/connections/mock-connect` call that creates a new account+calendar
 * server-side; sync/reconnect/disconnect/calendar-toggle actions optimistically
 * patch the shared `useConnections()` query cache in place so the onboarding
 * accounts step and the Settings > Accounts/Calendars tabs stay in sync with
 * each other for the rest of the session.
 */
export function useConnectionActions() {
  const qc = useQueryClient();

  const patch = React.useCallback(
    (updater: (data: ConnectionsData) => ConnectionsData) => {
      qc.setQueryData<ConnectionsData>(queryKeys.connections, (old) => (old ? updater(old) : old));
    },
    [qc],
  );

  const connect = React.useCallback(
    async (provider: AccountProvider, email: string, displayName: string) => {
      const result = await api.post<{ account: ConnectedAccount; calendar: Calendar | null }>(
        "/api/connections/mock-connect",
        { provider, email, displayName },
      );
      patch((data) => ({
        accounts: [...data.accounts, result.account],
        calendars: result.calendar ? [...data.calendars, result.calendar] : data.calendars,
      }));
      return result.account;
    },
    [patch],
  );

  const syncNow = React.useCallback(
    (accountId: string) => {
      patch((data) => ({
        ...data,
        accounts: data.accounts.map((a) =>
          a.id === accountId ? { ...a, syncStatus: "syncing" as const } : a,
        ),
      }));
      window.setTimeout(() => {
        patch((data) => ({
          ...data,
          accounts: data.accounts.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  syncStatus: "live" as const,
                  syncError: null,
                  lastSyncAt: new Date().toISOString(),
                }
              : a,
          ),
        }));
      }, 900);
    },
    [patch],
  );

  const disconnect = React.useCallback(
    (accountId: string) => {
      patch((data) => ({
        accounts: data.accounts.filter((a) => a.id !== accountId),
        calendars: data.calendars.filter((c) => c.connectedAccountId !== accountId),
      }));
    },
    [patch],
  );

  const setCalendarFlags = React.useCallback(
    (calendarId: string, fields: Partial<Calendar>) => {
      patch((data) => ({
        ...data,
        calendars: data.calendars.map((c) => {
          if (c.id !== calendarId) return c;
          const next = { ...c, ...fields };
          // Turning write access off can never leave this calendar as the write target.
          if (fields.writeEnabled === false) next.isWriteTarget = false;
          return next;
        }),
      }));
    },
    [patch],
  );

  const setWriteTarget = React.useCallback(
    (calendarId: string) => {
      patch((data) => ({
        ...data,
        calendars: data.calendars.map((c) => ({ ...c, isWriteTarget: c.id === calendarId })),
      }));
    },
    [patch],
  );

  return { connect, syncNow, reconnect: syncNow, disconnect, setCalendarFlags, setWriteTarget };
}
