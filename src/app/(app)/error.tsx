"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui/EmptyState";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon="solar:danger-triangle-linear"
        eyebrow="Something broke"
        message="This screen ran into a problem. Your data is safe — try again, or head back to Today."
        ctaLabel="Try again"
        onCta={reset}
      />
    </div>
  );
}
