import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils/cn";

const controlBase =
  "w-full rounded-control border bg-white/5 border-white/10 px-3 font-mono text-sm text-white placeholder:text-white/25 transition-colors focus:outline-none focus:border-lime/60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input ref={ref} className={cn(controlBase, "h-11", className)} {...rest} />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...rest }, ref) => (
  <textarea ref={ref} className={cn(controlBase, "min-h-24 py-3", className)} {...rest} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(controlBase, "h-11 appearance-none bg-ink-raised", className)}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Switch({
  checked,
  onCheckedChange,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={cn(
        "relative h-6 w-11 rounded-full border border-white/15 bg-white/10 transition-colors data-[state=checked]:bg-lime",
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-ink" />
    </SwitchPrimitive.Root>
  );
}

export function Field({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="font-mono text-xs uppercase tracking-widest text-white/55">{label}</span>
      {children}
      {description && <span className="font-mono text-xs text-white/35">{description}</span>}
    </label>
  );
}
