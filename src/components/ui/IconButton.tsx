import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  "aria-label": string;
  tone?: "on-blue" | "on-paper";
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, className, tone = "on-blue", ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-control border transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60",
          tone === "on-blue"
            ? "border-white/10 bg-white/5 text-white hover:bg-white/10"
            : "border-ink/15 bg-white text-ink hover:bg-paper-hi",
          className,
        )}
        {...rest}
      >
        <Icon name={icon} size={18} />
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
