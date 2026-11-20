import { useMemo } from "react";

import { parseVisualParams } from "@shared/lesson-visual-params";
import { sanitizeIllustration } from "@shared/illustration-svg";
import { normalizeVisualText, type DecisionTreeVisualNode, type VisualTone } from "@shared/source-visual-render";

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S2b-1, 16. szakasz): a forrás döntési fájának és képes kártyáinak
 * újrarajzolása. Csak érvényes paraméterből rajzolunk (`shared/lesson-visual-params.ts` szigorú sémája); a szöveg React
 * szövegcsomópont. A kártya rajza a meglévő illusztráció-tisztító allowlistjén átment SVG (nincs script, esemény, hivatkozás, stílus) —
 * ugyanaz az út, mint az `illustration` ábráé (`explanatory-visuals.tsx`). Szín a sáv tokenjeiből (`lesson-design.css`, `.sv-tree*`,
 * `.sv-card*`), és a levél tónusát alakjel is jelzi.
 */
type AnimProps = { params: Record<string, unknown>; caption: string };

const FRAME = "motion-safe:animate-draw border rounded-lg bg-card p-4 motion-reduce:animate-none sv-figure";
const TONES: VisualTone[] = ["a", "b", "c"];
const TONE_MARK: Record<VisualTone, string> = { a: "●", b: "▲", c: "■", neutral: "" };

function Caption({ caption, shown }: { caption: string; shown: ReadonlyArray<string | undefined> }) {
  const own = normalizeVisualText(caption);
  if (!own || shown.some((s) => s && normalizeVisualText(s) === own)) return null;
  return <figcaption className="text-sm text-muted-foreground mt-2">{caption}</figcaption>;
}

/** Egymásba ágyazott lista: a gyerekek ugyanannak a szülőnek a listaelemei; az ág felirata a listaelem szövegének része. */
function TreeNode({ node, branch, tone }: { node: DecisionTreeVisualNode; branch?: string; tone?: VisualTone }) {
  const leaf = !node.branches?.length;
  return (
    <>
      <div className={`sv-tree-node${leaf ? ` sv-tree-leaf sv-tone-${tone ?? "a"}` : ""}`}>
        {branch && <span className="sv-tree-branch">{branch}</span>}
        {branch && <span className="sr-only">: </span>}
        {leaf && tone && TONE_MARK[tone] && <span className="sv-tone-mark" aria-hidden="true">{TONE_MARK[tone]}</span>}
        <span className="sv-tree-text">{node.text}</span>
      </div>
      {!leaf && (
        <ul className="sv-tree-children">
          {node.branches!.map((b, i) => (
            <li key={i} className="sv-tree-item"><TreeNode node={b.node} branch={b.label} tone={TONES[i % TONES.length]} /></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DecisionTreeAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("decisionTree", params);
  if (!p) return null;
  return (
    <figure className={FRAME} data-anim="decisionTree">
      <div className="sv-tree">
        <TreeNode node={p.root} />
      </div>
      <Caption caption={caption} shown={[p.root.text]} />
    </figure>
  );
}

function CardArt({ svg, label }: { svg: string; label: string }) {
  const check = useMemo(() => sanitizeIllustration(svg), [svg]);
  if (!check.ok) return null;
  return (
    <div
      className="sv-card-art lesson-figure-paper"
      role="img"
      aria-label={label}
      // A tartalom a shared/illustration-svg.ts allowlistjén átment SVG (nincs script, esemény, link, stílus).
      dangerouslySetInnerHTML={{ __html: check.svg }}
    />
  );
}

export function PictureCardsAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("pictureCards", params);
  if (!p) return null;
  return (
    <figure className={FRAME} data-anim="pictureCards">
      <ul className="sv-cards-grid">
        {p.cards.map((c, i) => (
          <li key={i} className={`sv-card sv-tone-${TONES[i % TONES.length]}`}>
            <CardArt svg={c.svg} label={c.label} />
            <span className="sv-card-label">{c.label}</span>
            {c.caption && <span className="sv-card-caption">{c.caption}</span>}
            {c.example && <span className="sv-card-example">{c.example}</span>}
          </li>
        ))}
      </ul>
      <Caption caption={caption} shown={[]} />
    </figure>
  );
}
