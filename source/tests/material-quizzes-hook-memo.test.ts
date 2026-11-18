/**
 * Kanban #90 — a `useMaterialQuizzes` kimenete referencia-stabil (spec: docs/specs/2026-11-17-kerdesbank-hook-memo.md).
 *
 * A mérce a SPEC: (AC1) változatlan adatnál az `items` / `rawItems` / `materials` referencia renderek között azonos, és a
 * szűrés nem fut újra; (AC2) adat- vagy topicFilter-váltáskor új, helyes eredmény; (AC3) betöltés alatt stabil üres
 * referencia; (AC4) a tartalom bájtra azonos a régi számítással. A hook egy valódi React-gyökérben fut (jsdom), hálózat nélkül.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";
import { isPlayableQuestion, uniqueQuizContent } from "../shared/game-quiz-contract";
import type { MaterialQuizItem, MaterialQuizResponse, MaterialQuizTopic } from "../client/src/hooks/useMaterialQuizzes";

/**
 * A jsdom a függőségi fában már jelen van (`isomorphic-dompurify` → `jsdom`), de típusdefiníció nincs hozzá: a teszt csak
 * ezt a szűk felületet használja.
 */
type DomWindow = Window & typeof globalThis & { close(): void };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, opts?: { url?: string }) => { window: DomWindow };
};

/** A régi (javítás előtti) képlet, szó szerint — ehhez mérünk. */
function legacyFilter(items: MaterialQuizItem[], topicFilter?: MaterialQuizTopic): MaterialQuizItem[] {
  const out = uniqueQuizContent(items.filter(isPlayableQuestion));
  if (!topicFilter) return out;
  return out.filter((i) => (i.topic ?? "").toLowerCase() === topicFilter);
}

/** Determinisztikus, vegyes minta: játszható, nem játszható, ismétlődő tartalom, vegyes topic. */
function makeSample(n: number, seed = 7): MaterialQuizItem[] {
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const topics: (string | null | undefined)[] = ["english", "English", "math", "nature", "hungarian", null, undefined];
  const words = ["alma", "körte", "szilva", "barack", "dinnye", "meggy", "eper", "málna", "ribizli", "som"];
  const out: MaterialQuizItem[] = [];
  for (let i = 0; i < n; i++) {
    const kind = rnd();
    const k = Math.floor(rnd() * 400);
    const opts = [0, 1, 2, 3].map((j) => `${words[(k + j) % words.length]} ${k}-${j}`);
    const topic = topics[Math.floor(rnd() * topics.length)];
    const base: MaterialQuizItem = {
      id: `q${i}`,
      prompt: `Melyik gyümölcs a(z) ${k}. sorszámú? (${words[k % words.length]})`,
      options: opts,
      correctIndex: Math.floor(rnd() * 4),
      explanation: rnd() < 0.5 ? `Mert ${k}.` : null,
      sourceMaterialId: `m${k % 5}`,
      ...(topic === undefined ? {} : { topic }),
    };
    if (kind < 0.1) out.push({ ...base, options: opts.slice(0, 2) }); // túl kevés opció
    else if (kind < 0.15) out.push({ ...base, correctIndex: 9 }); // rossz index
    else if (kind < 0.2) out.push({ ...base, prompt: "   " }); // üres prompt
    else if (kind < 0.3) out.push({ ...base, id: undefined }); // azonosító nélkül (tartalmi kulcs)
    else out.push(base);
    if (rnd() < 0.15) out.push({ ...base, id: undefined }); // ismétlődő tartalom
  }
  return out;
}

const FILTERS: (MaterialQuizTopic | undefined)[] = [undefined, "english", "math", "nature", "hungarian"];

test("AC4: selectPlayableMaterialItems bájtra azonos a régi képlettel, minden topicFilterrel (vegyes, 3000+ tétel)", async () => {
  const { selectPlayableMaterialItems } = await import("../client/src/hooks/useMaterialQuizzes");
  const sample = makeSample(3200);
  for (const f of FILTERS) {
    const expected = legacyFilter(sample, f);
    const got = selectPlayableMaterialItems(sample, f);
    assert.equal(JSON.stringify(got), JSON.stringify(expected), `topicFilter=${String(f)}`);
  }
  // A minta tényleg vegyes: van kiszűrt és van megtartott tétel.
  const kept = selectPlayableMaterialItems(sample).length;
  assert.ok(kept > 100 && kept < sample.length, `kept=${kept} / ${sample.length}`);
});

/* ---------- Valódi hook egy React-gyökérben (jsdom) ---------- */

let dom: { window: DomWindow };
const globalKeys = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

before(() => {
  dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { url: "http://localhost/" });
  for (const k of globalKeys) savedGlobals.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  const set = (k: string, v: unknown) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  set("window", dom.window);
  set("document", dom.window.document);
  set("navigator", dom.window.navigator);
  set("HTMLElement", dom.window.HTMLElement);
  set("Node", dom.window.Node);
  set("IS_REACT_ACT_ENVIRONMENT", true);
  // A teszt nem használhat hálózatot: ha a hook mégis lekérne, a próba bukik.
  set("fetch", async () => {
    throw new Error("network forbidden in test");
  });
});

after(() => {
  for (const [k, d] of savedGlobals) {
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  dom.window.close();
});

type Snap = { items: MaterialQuizItem[]; rawItems: MaterialQuizItem[]; materials: MaterialQuizResponse["materials"] };

/** Számláló `filter` a tömbön (nem felsorolható saját tulajdonság) — azt méri, hányszor szűri a hook a nyers tételeket. */
function countingItems(items: MaterialQuizItem[]): { items: MaterialQuizItem[]; count: () => number } {
  let n = 0;
  const arr = items.slice();
  Object.defineProperty(arr, "filter", {
    enumerable: false,
    value(this: MaterialQuizItem[], ...args: Parameters<MaterialQuizItem[]["filter"]>) {
      n++;
      return Array.prototype.filter.apply(this, args as never);
    },
  });
  return { items: arr, count: () => n };
}

async function mountHook(opts: { grade: number | null; topicFilter?: MaterialQuizTopic; data?: MaterialQuizResponse }) {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
  const { useMaterialQuizzes } = await import("../client/src/hooks/useMaterialQuizzes");

  // gcTime: Infinity — különben a gyorsítótár 5 perces takarító-időzítője nyitva tartaná a tesztfolyamatot.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (opts.data) client.setQueryData(["/api/games/material-quizzes", opts.grade ?? "none", "recent"], opts.data);

  const snaps: Snap[] = [];
  let bump: () => void = () => {};
  let setTopic: (t: MaterialQuizTopic | undefined) => void = () => {};

  function Probe() {
    const [, setTick] = React.useState(0);
    const [topic, setTopicState] = React.useState<MaterialQuizTopic | undefined>(opts.topicFilter);
    bump = () => setTick((t) => t + 1);
    setTopic = (t) => setTopicState(t);
    const r = useMaterialQuizzes(opts.grade, topic);
    snaps.push({ items: r.items, rawItems: r.rawItems, materials: r.materials });
    return null;
  }

  const container = document.getElementById("root")!;
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));
  });
  return {
    snaps,
    client,
    rerender: async (times: number) => {
      for (let i = 0; i < times; i++) await act(async () => bump());
    },
    setTopic: async (t: MaterialQuizTopic | undefined) => act(async () => setTopic(t)),
    setData: async (d: MaterialQuizResponse) =>
      act(async () => {
        client.setQueryData(["/api/games/material-quizzes", opts.grade ?? "none", "recent"], d);
        // A TanStack Query a feliratkozókat makrotaszkban (setTimeout 0) értesíti — megvárjuk, mielőtt az act lezárul.
        await new Promise((r) => setTimeout(r, 20));
      }),
    unmount: async () => {
      await act(async () => root.unmount());
      client.clear();
    },
  };
}

function response(items: MaterialQuizItem[]): MaterialQuizResponse {
  return { classroom: 4, materials: [{ id: "m1", title: "Gyümölcsök", createdAt: "2026-11-01T10:00:00.000Z" }], items };
}

test("AC1: változatlan adatnál 6 újrarenderelés alatt az items / rawItems / materials referencia azonos, a szűrés nem fut újra", async () => {
  const sample = makeSample(800, 11);
  const counted = countingItems(sample);
  const h = await mountHook({ grade: 4, data: response(counted.items) });
  try {
    const first = h.snaps.at(-1)!;
    const filtersAfterFirst = counted.count();
    assert.ok(filtersAfterFirst >= 1, "az első számítás szűr");
    const before = h.snaps.length;
    await h.rerender(6);
    assert.ok(h.snaps.length >= before + 6, `legalább 6 új render (${h.snaps.length - before})`);
    for (const s of h.snaps.slice(before)) {
      assert.equal(s.items, first.items, "items referencia");
      assert.equal(s.rawItems, first.rawItems, "rawItems referencia");
      assert.equal(s.materials, first.materials, "materials referencia");
    }
    assert.equal(counted.count(), filtersAfterFirst, "a nyers tételek szűrése nem futott újra");
    assert.equal(JSON.stringify(first.items), JSON.stringify(legacyFilter(sample)), "tartalom = régi képlet");
  } finally {
    await h.unmount();
  }
});

test("AC2: adatváltáskor és topicFilter-váltáskor új, helyes eredmény", async () => {
  const a = makeSample(600, 21);
  const b = makeSample(500, 22);
  const h = await mountHook({ grade: 4, data: response(a) });
  try {
    const r0 = h.snaps.at(-1)!.items;
    assert.equal(JSON.stringify(r0), JSON.stringify(legacyFilter(a)));

    await h.setData(response(b));
    const r1 = h.snaps.at(-1)!.items;
    assert.notEqual(r1, r0, "új adat → új tömb");
    assert.equal(JSON.stringify(r1), JSON.stringify(legacyFilter(b)));

    await h.setTopic("english");
    const r2 = h.snaps.at(-1)!.items;
    assert.notEqual(r2, r1, "topicFilter-váltás → új tömb");
    assert.equal(JSON.stringify(r2), JSON.stringify(legacyFilter(b, "english")));
    assert.ok(r2.length > 0 && r2.every((i) => (i.topic ?? "").toLowerCase() === "english"));

    await h.setTopic(undefined);
    assert.equal(JSON.stringify(h.snaps.at(-1)!.items), JSON.stringify(legacyFilter(b)), "visszaváltás után helyes");
  } finally {
    await h.unmount();
  }
});

test("AC3: betöltés / letiltott lekérdezés alatt stabil, üres referencia", async () => {
  const h = await mountHook({ grade: null });
  try {
    const first = h.snaps.at(-1)!;
    assert.deepEqual([first.items.length, first.rawItems.length, first.materials.length], [0, 0, 0]);
    const before = h.snaps.length;
    await h.rerender(5);
    for (const s of h.snaps.slice(before)) {
      assert.equal(s.items, first.items);
      assert.equal(s.rawItems, first.rawItems);
      assert.equal(s.materials, first.materials);
    }
  } finally {
    await h.unmount();
  }
});
