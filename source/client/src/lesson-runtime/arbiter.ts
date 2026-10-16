/**
 * Tételgyár T7.2 (docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md): a döntőbíró kliensoldala. Kiértékelés után a nem teljes pontos,
 * nem üres válaszokat a szerver döntőbírója is megnézi; az ítélet CSAK EMELHET (a szerver is így adja, a kliens is így számol). Hiba → nincs
 * változás. Az ítéletek a körrel együtt, helyben mentődnek (a válaszok a kiértékelés után már nem változnak).
 */
import { useEffect, useRef, useState } from "react";
import type { AnswerScore } from "@shared/lesson-experience-score";

export type ArbiterSource = { kind: "lesson"; htmlFileId: string } | { kind: "html"; materialId: string };
export type ArbiterResult = AnswerScore & { source: "pontozó" | "döntőbíró" | "gyorsítótár" };

// Review #258: a szerver modellenként 30 s-ot enged (Opus 5.5, majd tartalék GPT-6.1 Sol) — a kliens a teljes láncot kivárja.
const TIMEOUT_MS = 70_000;
const PARALLEL = 3;

/** A `/dev/:id` HTML-lecke azonosítója a lap útvonalából; más útvonalon nincs döntőbíró. */
export function htmlArbiterSource(pathname: string): ArbiterSource | null {
  const m = /^\/dev\/([^/]+)\/?$/.exec(pathname);
  return m ? { kind: "html", materialId: decodeURIComponent(m[1]) } : null;
}

export async function requestArbiter(source: ArbiterSource, taskId: string, answer: string): Promise<ArbiterResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("/api/lessons/arbiter", {
      method: "POST", credentials: "omit", signal: controller.signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, taskId, answer }),
    });
    if (!res.ok) return null;
    const body = await res.json() as Partial<ArbiterResult>;
    if ((body.state !== "ok" && body.state !== "partial" && body.state !== "fail") || typeof body.score !== "number") return null;
    return { state: body.state, score: body.score, reason: typeof body.reason === "string" ? body.reason : "", source: body.source ?? "pontozó" };
  } catch { return null; } finally { clearTimeout(timer); }
}

/** A jobb ítélet (pont szerint) — a döntőbíró sosem ront. */
export function bestVerdict(det: AnswerScore, arb: ArbiterResult | null | undefined): AnswerScore & { arbiter: boolean } {
  return arb && arb.score > det.score ? { state: arb.state, score: arb.score, reason: arb.reason || det.reason, arbiter: true } : { ...det, arbiter: false };
}

type Stored = Record<string, ArbiterResult>;
function load(key: string): Stored {
  try { const v = JSON.parse(localStorage.getItem(key) ?? "{}"); return v && typeof v === "object" ? v as Stored : {}; } catch { return {}; }
}

/**
 * A kiértékelt kör (`active`) nem teljes pontos, nem üres válaszaira a döntőbíró; legfeljebb 3 kérés egyszerre. A `storageKey` a körhöz
 * kötött (új kör → üres). Visszaad: feladat-id → ítélet, és a még futó feladatok halmaza.
 */
export function useArbiterVerdicts(storageKey: string, source: ArbiterSource | null | undefined, active: boolean,
  items: Array<{ id: string; answer: string; det: AnswerScore }>) {
  const [verdicts, setVerdicts] = useState<Stored>(() => load(storageKey));
  const [pending, setPending] = useState<string[]>([]);
  // Review #242 (P1): a már elindított feladatok a kör idejére rögzülnek — egy beérkező ítélet (új `todo`) nem indítja újra a többit, így
  // nincs duplikált kérés, és az egyidejűség a deklarált háromnál marad. Kör-váltáskor (`storageKey`) a régi válasz már nem íródik be.
  const started = useRef(new Set<string>());
  const currentKey = useRef(storageKey);
  useEffect(() => { currentKey.current = storageKey; started.current = new Set(); setPending([]); setVerdicts(load(storageKey)); }, [storageKey]);
  const todo = active && source ? items.filter((i) => i.det.state !== "ok" && i.answer.trim() && !verdicts[i.id] && !started.current.has(i.id)).map((i) => i.id) : [];
  const todoKey = todo.join("|");
  useEffect(() => {
    if (!todo.length || !source) return;
    const roundKey = storageKey;
    for (const id of todo) started.current.add(id);
    setPending((old) => [...new Set([...old, ...todo])]);
    const queue = items.filter((i) => todo.includes(i.id));
    const worker = async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const result = await requestArbiter(source, item.id, item.answer);
        if (currentKey.current !== roundKey) return;
        // Hiba / plafon esetén a pontozó ítélete a munkamenetben rögzül (nincs újrakérdezés minden megjelenítéskor), de helyben CSAK a
        // valódi döntőbírói ítélet mentődik — egy átmeneti hiba így a következő megnyitáskor újra próbálható.
        const id = item.id, det = item.det;
        setVerdicts((old) => {
          const next = { ...old, [id]: result ?? { ...det, source: "pontozó" as const } };
          const durable = Object.fromEntries(Object.entries(next).filter(([, v]) => v.source !== "pontozó"));
          try { localStorage.setItem(roundKey, JSON.stringify(durable)); } catch { /* A helyi mentés opcionális. */ }
          return next;
        });
        setPending((old) => old.filter((x) => x !== id));
      }
    };
    void Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    // A teendők listája (todoKey) dönt; az `items` minden rendereléskor új tömb. Szándékosan nincs megszakító cleanup: az elindított kérés
    // eredménye a saját körébe íródik (a `currentKey` őrzi), a következő effekt csak az új, még el nem indított feladatokat veszi fel.
  }, [todoKey, storageKey, source?.kind, source && ("htmlFileId" in source ? source.htmlFileId : source.materialId)]);
  return { verdicts, pending: new Set(pending) };
}
