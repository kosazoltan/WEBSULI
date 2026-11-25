/**
 * Adventi naptár — képhely (docs/specs/2026-11-18-adventi-naptar.md 13.7): a kész kép a jegyzékből, különben AZONOS méretű
 * helyőrző ugyanabban a dobozban (a végleges képek cseréje nem mozdítja el az elrendezést). A felirat nem a képen van.
 */
import type { CSSProperties } from "react";
import { ADVENT_ART, ADVENT_ART_BASE } from "@shared/advent/art-manifest";
import { ADVENT_ART_SPECS } from "@shared/advent/art";

type Props = {
  id: string;
  className?: string;
  /** A hajtás fölötti kép (főoldali banner, háttér): nem lusta, elsőbbséggel tölt. */
  eager?: boolean;
  /** Díszítő használat: üres `alt` akkor is, ha a jegyzékben van szöveg. */
  decorative?: boolean;
  style?: CSSProperties;
};

export default function AdventArt({ id, className, eager = false, decorative = false, style }: Props) {
  const spec = ADVENT_ART_SPECS[id];
  if (!spec) return null;
  const file = ADVENT_ART[id];
  const alt = decorative ? "" : spec.alt;
  const box = { aspectRatio: `${spec.width} / ${spec.height}`, ...style };
  if (file) {
    return (
      <img
        className={`advent-art ${className ?? ""}`}
        src={`${ADVENT_ART_BASE}${file}`}
        alt={alt}
        width={spec.width}
        height={spec.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        {...(eager ? { fetchpriority: "high" } : {})}
        style={box}
        data-advent-art={id}
      />
    );
  }
  // Helyőrző: a hátterek CSS-színátmenetet kapnak (advent.css), az ablakképek egy nagy jelet.
  return (
    <span
      className={`advent-art advent-art--placeholder ${className ?? ""}`}
      style={box}
      data-advent-art={id}
      data-advent-placeholder="true"
      {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}
    >
      {spec.placeholder ? <span className="advent-art__glyph" aria-hidden="true">{spec.placeholder}</span> : null}
    </span>
  );
}
