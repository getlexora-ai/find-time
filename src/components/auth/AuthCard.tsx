"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BracketFrame } from "@/components/motif/BracketFrame";
import { BrowserChromeCard } from "@/components/motif/BrowserChromeCard";
import { TelemetryRow } from "@/components/motif/AxisMarkers";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useLogin } from "@/lib/hooks/useSession";

export function AuthCard({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = React.useState("");
  const [linkSent, setLinkSent] = React.useState(false);

  const complete = async () => {
    await login.mutateAsync();
    router.push(params.get("next") ?? "/onboarding/welcome");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-6">
      <BracketFrame variant="app" />
      <BrowserChromeCard url={`APP.FINDTIME.AI / ${mode === "login" ? "SIGN-IN" : "SIGN-UP"}`} tone="dark" className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-6 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lime text-ink shadow-lime-glow">
            <Icon name="solar:clock-circle-linear" size={18} />
          </span>
          <div className="text-center">
            <h1 className="font-mono text-xl font-medium text-white">
              {mode === "login" ? "Sign in to Find Time" : "Create your account"}
            </h1>
            <p className="mt-1 font-mono text-xs text-white/50">
              {mode === "login" ? "Welcome back." : "Free for 14 days. No card required."}
            </p>
          </div>

          <Button variant="paper" className="w-full" icon="solar:letter-linear" onClick={complete} loading={login.isPending}>
            Continue with Google
          </Button>

          <div className="flex w-full items-center gap-3 text-white/25">
            <span className="h-px flex-1 bg-white/10" />
            <span className="font-mono text-micro uppercase tracking-wider">or</span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          {linkSent ? (
            <p className="font-mono text-xs text-lime">Check your inbox for a sign-in link.</p>
          ) : (
            <form
              className="flex w-full flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setLinkSent(true);
              }}
            >
              <Input
                type="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" variant="ghost" className="w-full">
                Send magic link
              </Button>
            </form>
          )}
        </div>
      </BrowserChromeCard>

      <TelemetryRow
        items={["SESSION.NEW", "TLS.1.3", "READ-ONLY SCOPES"]}
        className="absolute bottom-8"
      />
    </div>
  );
}
