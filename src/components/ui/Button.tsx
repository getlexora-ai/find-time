import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "@/components/ui/Icon";

type Variant = "primary" | "inverse" | "ghost" | "paper" | "quiet";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: string;
  iconPosition?: "left" | "right";
  asChild?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-lime text-ink shadow-lime-lift hover:bg-lime-hi hover:-translate-y-0.5",
  inverse: "bg-ink text-white border border-white/10 hover:bg-ink-hover hover:-translate-y-0.5",
  ghost: "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:-translate-y-0.5",
  paper: "bg-white text-ink border border-ink/15 hover:bg-paper-hi hover:-translate-y-0.5",
  quiet: "bg-transparent text-white/60 hover:text-white",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-xs gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconPosition = "left",
      disabled,
      children,
      asChild = false,
      ...rest
    },
    ref,
  ) => {
    const resolvedIcon = loading ? "solar:refresh-circle-linear" : icon;
    const classes = cn(
      "inline-flex items-center justify-center rounded-control font-mono font-medium uppercase tracking-wider transition-all duration-150",
      "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/60 focus-visible:ring-offset-0",
      variantClasses[variant],
      sizeClasses[size],
      className,
    );
    const content = (
      <>
        {resolvedIcon && iconPosition === "left" && (
          <Icon name={resolvedIcon} className={loading ? "animate-spin-once" : undefined} />
        )}
        {children}
        {resolvedIcon && iconPosition === "right" && (
          <Icon name={resolvedIcon} className={loading ? "animate-spin-once" : undefined} />
        )}
      </>
    );

    if (asChild) {
      const child = React.Children.only(children) as React.ReactElement<{
        className?: string;
        children?: React.ReactNode;
      }>;
      return React.cloneElement(child, {
        ...rest,
        className: cn(classes, child.props.className),
        children: (
          <>
            {resolvedIcon && iconPosition === "left" && (
              <Icon name={resolvedIcon} className={loading ? "animate-spin-once" : undefined} />
            )}
            {child.props.children}
            {resolvedIcon && iconPosition === "right" && (
              <Icon name={resolvedIcon} className={loading ? "animate-spin-once" : undefined} />
            )}
          </>
        ),
      } as React.Attributes);
    }

    return (
      <button ref={ref} disabled={disabled || loading} className={classes} {...rest}>
        {content}
      </button>
    );
  },
);
Button.displayName = "Button";
