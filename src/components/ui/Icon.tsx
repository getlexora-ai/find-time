import { Icon as Iconify, type IconProps as IconifyProps } from "@iconify/react";
import { cn } from "@/lib/utils/cn";

export interface IconProps extends Omit<IconifyProps, "icon"> {
  name: string;
  size?: number;
}

/**
 * Every icon in the app goes through this wrapper so stroke-width and the
 * Solar Linear set stay consistent — never import @iconify/react directly.
 */
export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <Iconify
      icon={name}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      {...rest}
    />
  );
}
