"use client";

import * as React from "react";
import { useSettingsProfile, useUpdateProfile } from "@/lib/hooks/useSettings";
import { Field, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/SkeletonBlock";
import { useToast } from "@/components/ui/Toast";

const TIMEZONES = ["Europe/Berlin", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "UTC"];

export function ProfileSettingsTab() {
  const { data: user, isLoading } = useSettingsProfile();
  const update = useUpdateProfile();
  const { push } = useToast();
  const [name, setName] = React.useState("");
  const [timezone, setTimezone] = React.useState("Europe/Berlin");

  React.useEffect(() => {
    if (user) {
      setName(user.name);
      setTimezone(user.timezone);
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="flex flex-col gap-3">
        <SkeletonBlock className="h-11 w-full" />
        <SkeletonBlock className="h-11 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-periwinkle font-mono text-lg font-semibold text-ink">
          {user.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <p className="font-mono text-sm text-white">{user.email}</p>
          <p className="font-mono text-xs text-white/40">Primary account</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Timezone">
          <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Button
        className="self-start"
        onClick={() => {
          update.mutate({ name, timezone });
          push({ message: "Profile updated", variant: "success" });
        }}
      >
        Save changes
      </Button>

      <div className="mt-6 flex flex-col gap-3 rounded-card border border-ember/20 bg-ember/5 p-4">
        <p className="font-mono text-xs uppercase tracking-widest text-ember-200">Danger zone</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm">
            Export all data
          </Button>
          <Button variant="ghost" size="sm" className="border-ember/30 text-ember-200 hover:bg-ember/10">
            Delete account
          </Button>
        </div>
      </div>
    </div>
  );
}
