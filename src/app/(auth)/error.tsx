"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue p-6">
      <EmptyState
        icon="solar:danger-triangle-linear"
        eyebrow="Something broke"
        message="This step ran into a problem. Try again, or refresh to start over."
        ctaLabel="Try again"
        onCta={reset}
      />
    </div>
  );
}
