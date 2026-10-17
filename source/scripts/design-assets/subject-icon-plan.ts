/**
 * Websuli tantárgyi ikonkészlet — a tantárgy × évfolyamsáv mátrix és a motívumok (docs/specs/2026-10-17-websuli-ikonkeszlet.md).
 * A mátrix a NAT 2020 szerint: melyik tantárgy melyik sávban tanítható. A motívum korosztályonként érik (kockák → grafikon).
 * Ebből készül a design-assets/prompts.json „icon-<tantárgy>-<sáv>” tétele (scripts/design-assets/add-subject-icons.ts).
 */
import type { CatalogSubject } from "../../shared/catalog-taxonomy";
import { SUBJECT_BANDS, type DesignBand } from "../../shared/subject-icons";

export type Band = DesignBand;
/** A mátrix a shared/subject-icons.ts-ben él: a lejátszó és a mentés ugyanazt használja. */
export { SUBJECT_BANDS };

/** A sáv ikonstílusa (szabályterv 2.3) és a stílusreferencia (jóváhagyott ikon). */
export const BAND_ICON_STYLE: Record<Band, { style: string; reference: string }> = {
  explorer: { style: "chunky glossy soft 3D toy-like object, bright cheerful colors, very simple rounded shapes for 6–8 year olds", reference: "icon-matematika-young" },
  adventure: { style: "glossy soft 3D object with a playful adventurous feel, warm orange, sand and turquoise accents, for 9–11 year olds", reference: "icon-matematika-young" },
  studio: { style: "clean soft 3D object with a matte finish, indigo, violet and teal palette, mature but friendly, for 12–14 year olds", reference: "icon-fizika" },
  laboratory: { style: "clean soft 3D object in exactly the same style, palette and lighting as the reference atom icon, cool blues, precise", reference: "icon-fizika" },
  future: { style: "sleek premium soft 3D object, deep navy and teal with subtle glass highlights, sophisticated, for 17–18 year olds", reference: "icon-fizika" },
};

/** Korosztályonként érő motívum: [1–2., 3–5., 6–8., 9–10., 11–12.]; a nem tanított sáv motívuma nem használt. */
export const SUBJECT_MOTIFS: Record<CatalogSubject, [string, string, string, string, string]> = {
  matematika: ["colorful counting blocks", "a wooden abacus with a ruler", "a protractor with a set square triangle", "a smooth function curve on grid paper with a pencil", "a 3D coordinate surface model"],
  "magyar-nyelvtan": ["a big friendly crayon beside a small open notebook with wavy practice lines", "a notebook with a pencil and colorful sticky tabs", "puzzle pieces fitting together like parts of a sentence", "a tree diagram of connected nodes, like sentence structure", "an elegant fountain pen over a structured page with brackets"],
  "magyar-irodalom": ["an open storybook with a ribbon bookmark", "a storybook with a small paper castle popping out", "a stack of books with a feather quill", "a classic leather-bound book with a theatre mask", "an open poetry book with a feather quill and an inkwell"],
  kornyezetismeret: ["a little house, a tree and the sun together", "a small globe with a green leaf and a ladybug", "", "", ""],
  termeszetismeret: ["", "a magnifying glass over a leaf and a ladybug", "a microscope beside a leaf and a small flask", "", ""],
  tortenelem: ["", "a small castle tower with a flag", "a knight's helmet and a parchment scroll", "a classical column with an hourglass", "an antique map scroll with a compass rose"],
  "tarsadalmi-ismeretek": ["", "", "three connected people silhouettes around a round table", "a balance scale of justice", "a parliament dome with a ballot box"],
  biologia: ["", "", "a leaf with a ladybug under a magnifying glass", "a DNA double helix with a leaf", "a stylised cell with a DNA strand"],
  kemia: ["", "", "a laboratory flask with colorful liquid bubbles", "a laboratory flask holding an atom model", "a molecule ball-and-stick model with a test tube"],
  fizika: ["", "", "a magnet attracting small metal balls", "an atom with elliptical electron orbits", "a pendulum with a wave graph and a lightning bolt"],
  foldrajz: ["", "", "a globe on a stand with a map pin", "a globe with latitude lines and a map pin", "a topographic relief map tile with a compass"],
  angol: ["two colorful speech bubbles", "two speech bubbles beside a small red double-decker bus toy", "a book with two speech bubbles and a small globe", "a globe with two speech bubbles", "a passport-like booklet with a globe and speech bubble"],
  nemet: ["", "two speech bubbles with a small black-red-gold ribbon", "a book with two speech bubbles and a small black-red-gold ribbon", "a globe with speech bubbles and a black-red-gold ribbon", "a travel booklet with speech bubbles and a black-red-gold ribbon"],
  francia: ["", "two speech bubbles with a small blue-white-red ribbon", "a book with two speech bubbles and a small blue-white-red ribbon", "a globe with speech bubbles and a blue-white-red ribbon", "a travel booklet with speech bubbles and a blue-white-red ribbon"],
  informatika: ["", "a friendly little robot with a tablet", "a laptop with colorful code blocks shown only as shapes", "a laptop with a small circuit-chip symbol", "a circuit chip with glowing connection lines"],
  "enek-zene": ["a musical note and a small drum", "a xylophone with a musical note", "headphones with musical notes", "a violin with a musical note", ""],
  "hit-es-erkolcstan": ["two hands holding a small heart", "a dove carrying a small olive branch", "an open book with a soft glowing heart", "a lantern with a gentle light", "a scale with a heart and a book"],
  "vizualis-kultura": ["a painter palette with brushes", "paint brushes in a jar with color splashes", "a drawing tablet with a stylus and color swatches", "a camera beside a color wheel", "a film clapper with a color wheel"],
  technika: ["toy building bricks with a small hammer", "a toy screwdriver, gears and a small wrench", "gears with a ruler and a pencil, like a design plan", "", ""],
};

export const BANDS: Band[] = ["explorer", "adventure", "studio", "laboratory", "future"];
