import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, BookOpen, Lightbulb, MoveHorizontal } from "lucide-react";

import { parseVisualParams } from "@shared/lesson-visual-params";
import { SOURCE_VISUAL_TEXT, type RuleBoxTone } from "@shared/lesson-block-label";
import { normalizeVisualText, type VisualTone } from "@shared/source-visual-render";

/**
 * Spec 2026-11-18 (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, S2a): a forrás ábráinak ÚJRARAJZOLÁSA a lecke saját elemeivel —
 * táblázat, szabálydoboz, összehasonlító kártyák. A paraméterek alakja a megosztott szerződésé (`shared/source-visual-render.ts`),
 * az érvényességet a `shared/lesson-visual-params.ts` szigorú sémája méri: csak érvényes paraméterből rajzolunk (hibásnál nincs ábra).
 *
 * BIZTONSÁG: a cellák / pontok / kártyasorok a modelltől és a forrásból jönnek, ezért KIZÁRÓLAG React szövegcsomópontként kerülnek
 * a lapra (nyers HTML-beillesztés nincs). Feliratok (a tónus neve, „Példa”, görgetésjelző) a kódszótárból; szín a sáv tokenjeiből
 * (`lesson-design.css`), és a szín soha nem az egyetlen jelentéshordozó (tónusjel / ikon / felirat is áll mellette).
 */

type AnimProps = { params: Record<string, unknown>; caption: string };

const FRAME = "motion-safe:animate-draw border rounded-lg bg-card p-4 motion-reduce:animate-none sv-figure";
/** A tónus alakjele: a színkód mellett alak is megkülönbözteti az oszlopot / kártyát (a semleges tónus jel nélküli). */
const TONE_MARK: Record<VisualTone, string> = { a: "●", b: "▲", c: "■", neutral: "" };
const CARD_TONES: VisualTone[] = ["a", "b", "c"];
const RULE_ICON: Record<RuleBoxTone, typeof BookOpen> = { rule: BookOpen, warning: AlertTriangle, tip: Lightbulb };

/** A blokk felirata csak akkor jelenik meg külön, ha nem ismétli a megjelenítő már kiírt címét / kódszótári feliratát. */
function Caption({ caption, shown }: { caption: string; shown: ReadonlyArray<string | undefined> }) {
  const own = normalizeVisualText(caption);
  if (!own || shown.some((s) => s && normalizeVisualText(s) === own)) return null;
  return <figcaption className="text-sm text-muted-foreground mt-2">{caption}</figcaption>;
}

function ToneMark({ tone }: { tone: VisualTone }) {
  return TONE_MARK[tone] ? <span className="sv-tone-mark" aria-hidden="true">{TONE_MARK[tone]}</span> : null;
}

/** Igaz, ha a tároló tartalma szélesebb a tárolónál (a görgetésjelző csak ekkor látszik). */
function useOverflowing<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return [ref, overflowing] as const;
}

export function TableAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("table", params);
  const [scrollRef, overflowing] = useOverflowing<HTMLDivElement>();
  if (!p) return null;
  const columns = p.headers.length;
  // Három vagy több oszlopnál az első oszlop sorfejléc (és görgetéskor a helyén marad); a kétoszlopos tábla két egyenrangú oszlop.
  const rowHeaders = columns >= 3;
  const name = p.caption ?? (caption || SOURCE_VISUAL_TEXT.tableFallbackName);
  return (
    <figure className={FRAME} data-anim="table">
      <div ref={scrollRef} className="sv-table-scroll" tabIndex={0} role="region" aria-label={name} data-overflowing={overflowing ? "true" : undefined}>
        <table className="sv-table" data-row-headers={rowHeaders ? "true" : undefined} style={{ "--sv-cols": columns } as CSSProperties}>
          {p.caption && <caption>{p.caption}</caption>}
          <thead>
            <tr>
              {p.headers.map((header, c) => {
                const tone = p.headerTones?.[c] ?? "neutral";
                return <th key={c} scope="col" className={`sv-tone-${tone}`} data-tone={tone}><ToneMark tone={tone} />{header}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (c === 0 && rowHeaders && cell
                  ? <th key={c} scope="row">{cell}</th>
                  : <td key={c} data-first={c === 0 && rowHeaders ? "true" : undefined}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflowing && <p className="sv-scroll-hint" data-testid="sv-scroll-hint"><MoveHorizontal className="w-4 h-4" aria-hidden="true" />{SOURCE_VISUAL_TEXT.scrollHint}</p>}
      <Caption caption={caption} shown={[p.caption]} />
    </figure>
  );
}

export function RuleBoxAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("ruleBox", params);
  if (!p) return null;
  const Icon = RULE_ICON[p.tone];
  const toneLabel = SOURCE_VISUAL_TEXT.ruleBoxTone[p.tone];
  return (
    <figure className={FRAME} data-anim="ruleBox" data-tone={p.tone}>
      <div className="sv-rule">
        <p className="sv-rule-head">
          <span className="sv-rule-icon" aria-hidden="true"><Icon className="w-5 h-5" /></span>
          {p.heading ? <><span className="sr-only">{toneLabel}: </span><strong>{p.heading}</strong></> : <strong>{toneLabel}</strong>}
        </p>
        <ul className="sv-rule-items">
          {p.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
      </div>
      <Caption caption={caption} shown={[p.heading, toneLabel, ...Object.values(SOURCE_VISUAL_TEXT.ruleBoxTone)]} />
    </figure>
  );
}

export function CompareCardsAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("compareCards", params);
  if (!p) return null;
  return (
    <figure className={FRAME} data-anim="compareCards">
      <div className="sv-cards" data-count={p.cards.length}>
        {p.cards.map((card, i) => {
          const tone = card.tone ?? CARD_TONES[i % CARD_TONES.length];
          return (
            <div key={i} className={`sv-card sv-tone-${tone}`} data-tone={tone} role="group" aria-label={card.title}>
              <p className="sv-card-title"><ToneMark tone={tone} />{card.title}</p>
              <ul className="sv-card-lines">
                {card.lines.map((line, k) => <li key={k}>{line}</li>)}
              </ul>
              {card.example && <p className="sv-card-example"><span className="sv-example-label">{SOURCE_VISUAL_TEXT.example}</span>{card.example}</p>}
            </div>
          );
        })}
      </div>
      <Caption caption={caption} shown={[]} />
    </figure>
  );
}
