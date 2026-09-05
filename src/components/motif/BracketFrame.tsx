import { cn } from "@/lib/utils/cn";

const arm = "absolute h-5 w-5 border-lime";

export function BracketFrame({
  variant = "app",
  crosshair = false,
}: {
  variant?: "app" | "marketing";
  crosshair?: boolean;
}) {
  const inset = variant === "app" ? "inset-3 sm:inset-5 lg:inset-7" : "inset-4 sm:inset-6 lg:inset-8";
  const armWeight = variant === "app" ? "border-2" : "border";

  return (
    <div className={cn("pointer-events-none fixed z-40 border border-white/10", inset)}>
      <span className={cn(arm, armWeight, "left-0 top-0 border-b-0 border-r-0")} />
      <span className={cn(arm, armWeight, "right-0 top-0 border-b-0 border-l-0")} />
      <span className={cn(arm, armWeight, "bottom-0 left-0 border-t-0 border-r-0")} />
      <span className={cn(arm, armWeight, "bottom-0 right-0 border-t-0 border-l-0")} />
      {crosshair && (
        <>
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/5" />
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/5" />
        </>
      )}
    </div>
  );
}
