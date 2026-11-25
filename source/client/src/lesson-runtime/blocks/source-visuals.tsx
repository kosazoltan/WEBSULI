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

/** `label`: a blokk kódszótári, korosztály szerinti felirata — a szabálydoboz a SAJÁT fejlécében mutatja (külön blokkfejléc nélkül). */
type AnimProps = { params: Record<string, unknown>; caption: string; label?: string };

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

/** Igaz, ha a tábla fejlécének valamelyik SZAVA a celláján belül több sorba tört (a szó közepén vágva). */
export function headerWordBroken(table: HTMLTableElement): boolean {
  const range = document.createRange();
  for (const th of Array.from(table.querySelectorAll("thead th"))) {
    const walker = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const word of (node.textContent ?? "").matchAll(/\S+/g)) {
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        if (new Set(Array.from(range.getClientRects(), (r) => Math.round(r.top))).size > 1) return true;
      }
    }
  }
  return false;
}

/**
 * Vak ellenőr J3: a KÉTOSZLOPOS (fele-fele, nem görgő) tábla fejlécének szava ne törjön ketté, amíg kisebb térközzel kifér.
 * Mérés után a tábla `data-head-fit` jelzője: nincs (a szavak épek) → `fit` (szűkebb térköz, a tónusjel külön sorban, az oszlopok a
 * fejléc szavaihoz igazodnak) → `break` (végső eset: így sem fér ki görgetés nélkül — a szó elválasztással törik, a tábla nem görög).
 */
function useHeaderFit(scrollRef: { current: HTMLElement | null }, enabled: boolean, headerKey: string) {
  const [fit, setFit] = useState<"fit" | "break" | undefined>(undefined);
  useEffect(() => {
    const scroller = scrollRef.current;
    const table = scroller?.querySelector("table");
    if (!enabled || !scroller || !table) return;
    let alive = true;
    const measure = () => {
      if (!alive) return;
      table.removeAttribute("data-head-fit");
      let next: "fit" | "break" | undefined;
      if (headerWordBroken(table)) {
        table.setAttribute("data-head-fit", "fit");
        next = headerWordBroken(table) || scroller.scrollWidth > scroller.clientWidth + 1 ? "break" : "fit";
      }
      if (next) table.setAttribute("data-head-fit", next); else table.removeAttribute("data-head-fit");
      setFit(next);
    };
    measure();
    // A betűk betöltése a szavak szélességét megváltoztathatja.
    void document.fonts?.ready.then(measure);
    if (typeof ResizeObserver === "undefined") return () => { alive = false; };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => { alive = false; observer.disconnect(); };
  // tt J9 (S2b-2): a fejlécek szövegének változására (szerkesztő / előnézet) is újramér.
  }, [scrollRef, enabled, headerKey]);
  return fit;
}

export function TableAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("table", params);
  const [scrollRef, overflowing] = useOverflowing<HTMLDivElement>();
  const headFit = useHeaderFit(scrollRef, !!p && p.headers.length <= 2, p ? p.headers.join("") : "");
  if (!p) return null;
  const columns = p.headers.length;
  // Három vagy több oszlopnál az első oszlop sorfejléc (és görgetéskor a helyén marad); a kétoszlopos tábla két egyenrangú oszlop.
  const rowHeaders = columns >= 3;
  const name = p.caption ?? (caption || SOURCE_VISUAL_TEXT.tableFallbackName);
  // Vak J7 (S2b-2): rövid tartalmú táblánál nincs oszlopszám-alapú legkisebb szélesség (egy „1 | 2 | 3” tábla 360 px-en sem görög).
  const compact = [p.headers, ...p.rows].every((row) => row.every((cell) => cell.length <= 12));
  return (
    <figure className={FRAME} data-anim="table">
      {/* Vak J2 (S2b-2): a cím a görgő kereten KÍVÜL (görgetés nélkül olvasható); a jelző a tábla FÖLÖTT. */}
      {p.caption && <p className="sv-table-title" aria-hidden="true">{p.caption}</p>}
      {overflowing && <p className="sv-scroll-hint" data-testid="sv-scroll-hint"><MoveHorizontal className="w-4 h-4" aria-hidden="true" />
        <span className="sv-hint-touch">{SOURCE_VISUAL_TEXT.scrollHintTouch}</span><span className="sv-hint-pointer">{SOURCE_VISUAL_TEXT.scrollHint}</span></p>}
      {/* Fókuszmegálló és nevesített régió csak akkor, ha a tábla tényleg görög (különben fölös Tab-megálló lenne). */}
      <div ref={scrollRef} className="sv-table-scroll" data-overflowing={overflowing ? "true" : undefined}
        {...(overflowing ? { tabIndex: 0, role: "region", "aria-label": name } : {})}>
        <table className="sv-table" data-cols={columns} data-row-headers={rowHeaders ? "true" : undefined} data-head-fit={headFit} data-compact={compact ? "true" : undefined} style={{ "--sv-cols": columns } as CSSProperties}>
          {p.caption && <caption className="sr-only">{p.caption}</caption>}
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
      <Caption caption={caption} shown={[p.caption]} />
    </figure>
  );
}

export function RuleBoxAnim({ params, caption, label }: AnimProps) {
  const p = parseVisualParams("ruleBox", params);
  if (!p) return null;
  const Icon = RULE_ICON[p.tone];
  // Egyetlen felirat mondja ki a tónust: a doboz saját jelzője (a kódszótárból; a lejátszó a korosztály szerintit adja át).
  const toneLabel = label || SOURCE_VISUAL_TEXT.ruleBoxTone[p.tone];
  const own = normalizeVisualText(caption);
  const note = own && ![p.heading, toneLabel, ...Object.values(SOURCE_VISUAL_TEXT.ruleBoxTone)].some((s) => s && normalizeVisualText(s) === own) ? caption : null;
  return (
    <figure className={FRAME} data-anim="ruleBox" data-tone={p.tone}>
      <div className="sv-rule">
        <p className="sv-rule-head">
          <span className="sv-rule-icon" aria-hidden="true"><Icon className="w-5 h-5" /></span>
          <span className="sv-rule-tone">{toneLabel}</span>
        </p>
        {p.heading && <p className="sv-rule-title"><strong>{p.heading}</strong></p>}
        <ul className="sv-rule-items">
          {p.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>
        {/* A blokk felirata a kereten BELÜL áll (kívül a következő blokk alcímének látszana). */}
        {note && <figcaption className="sv-rule-note">{note}</figcaption>}
      </div>
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
