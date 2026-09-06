import type { SVGProps } from "react";

/**
 * TORCH MONO icon — the F glyph (grid unit 6, cap height 72, stem 12, 1u chamfer
 * on the top-left + bottom-right corner) beside the two lime clock-colon dots,
 * locked by a diagonal pair of lime L-reticles. Kept in sync with
 * public/brand/icon.svg.
 *
 * tone="tile"  — full-colour mark on the blue app tile (default).
 * tone="mono"  — the mark alone in `currentColor`, no tile.
 */
export type MarkProps = SVGProps<SVGSVGElement> & {
  tone?: "tile" | "mono";
};

const F_GLYPH = "M12 0H54V12H18V30H48V42H18V66L12 72H6V6Z";

export function Mark({ tone = "tile", ...props }: MarkProps) {
  if (tone === "mono") {
    return (
      <svg
        viewBox="0 0 512 512"
        fill="currentColor"
        role="img"
        aria-label="Find Time"
        {...props}
      >
        <path d="M60 60h46v6H66v40h-6z" />
        <path transform="translate(93 112) scale(4)" d={F_GLYPH} />
        <circle cx="367" cy="200" r="28" />
        <circle cx="367" cy="312" r="28" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      role="img"
      aria-label="Find Time"
      {...props}
    >
      <rect width="512" height="512" rx="96" fill="#2047E6" />
      <rect width="512" height="512" rx="96" fill="#FFFFFF" fillOpacity="0.04" />
      <g fill="#CCFF00">
        <path d="M60 60h46v6H66v40h-6z" />
        <path d="M452 452h-46v-6h40v-40h6z" />
      </g>
      <path fill="#FFFFFF" transform="translate(93 112) scale(4)" d={F_GLYPH} />
      <g fill="#CCFF00">
        <circle cx="367" cy="200" r="28" />
        <circle cx="367" cy="312" r="28" />
      </g>
    </svg>
  );
}
