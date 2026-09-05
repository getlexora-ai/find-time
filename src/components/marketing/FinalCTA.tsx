import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function FinalCTA() {
  return (
    <div className="px-6 py-24 text-center sm:px-10">
      <h2 className="mx-auto max-w-lg font-mono text-3xl font-medium leading-tight tracking-tight text-white sm:text-4xl">
        Make room for the work that matters.
      </h2>
      <div className="mt-8 flex justify-center">
        <Button variant="inverse" size="lg" icon="solar:magic-stick-3-linear" asChild>
          <Link href="/signup">Start planning free</Link>
        </Button>
      </div>
    </div>
  );
}
