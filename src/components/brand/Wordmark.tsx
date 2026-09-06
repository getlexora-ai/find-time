import type { SVGProps } from "react";

/**
 * TORCH MONO — the Find Time custom alphabet, hand-drawn as SVG paths on a 6px
 * grid (cap height 72, advance width 60, stem/bar 12, with a 1u 45-degree chamfer
 * on each glyph's extreme top-left and bottom-right corner). Kept in sync with
 * public/brand/logo-primary.svg.
 *
 * Glyphs render in `currentColor`, so a text-* class recolours the wordmark.
 * The clock-colon dots and the L-reticles locking onto TIME use `accentColor`
 * (lime by default). Pass accentColor="currentColor" for a true one-colour lockup.
 */
const GLYPH: Record<string, string> = {
  F: "M12 0H54V12H18V30H48V42H18V66L12 72H6V6Z",
  I: "M18 0H48V12H36V60H48V66L42 72H12V60H24V12H12V6Z",
  N: "M12 0H18L42 48V0H54V66L48 72H42L18 24V72H6V6Z",
  D: "M12 0H36L54 18V54L36 72H6V6ZM18 12V60H30L42 48V24L30 12Z",
  T: "M12 0H54V12H36V66L30 72H24V12H6V6Z",
  M: "M12 0H18L30 36L42 0H54V66L48 72H42V36L30 72L18 36V72H6V6Z",
  E: "M12 0H54V12H18V30H48V42H18V60H54V66L48 72H6V6Z",
};

function Glyphs({ text, x }: { text: string; x: number }) {
  return (
    <>
      {text.split("").map((ch, i) => (
        <path
          key={i}
          d={GLYPH[ch]}
          fillRule={ch === "D" ? "evenodd" : undefined}
          transform={`translate(${x + i * 60} 24)`}
        />
      ))}
    </>
  );
}

export type WordmarkProps = SVGProps<SVGSVGElement> & {
  /** Colour of the colon dots + TIME reticles. Defaults to lime. */
  accentColor?: string;
};

export function Wordmark({ accentColor = "#CCFF00", ...props }: WordmarkProps) {
  return (
    <svg
      viewBox="0 0 556 120"
      fill="none"
      role="img"
      aria-label="Find Time"
      {...props}
    >
      <g fill="currentColor">
        <Glyphs text="FIND" x={0} />
        <Glyphs text="TIME" x={300} />
      </g>
      <g fill={accentColor}>
        <circle cx="270" cy="46" r="7" />
        <circle cx="270" cy="74" r="7" />
        <path d="M290 10h30v6h-24v24h-6z" />
        <path d="M550 10h-30v6h24v24h6z" />
        <path d="M290 110h30v-6h-24v-24h-6z" />
        <path d="M550 110h-30v-6h24v-24h6z" />
      </g>
    </svg>
  );
}
