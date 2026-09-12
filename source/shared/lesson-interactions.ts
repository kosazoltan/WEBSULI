import { DECISION_STORY_CONTRACT } from "./decision-story";
import { parse, type DefaultTreeAdapterMap } from "parse5";

export function withLessonInteractions(html: string, origin = ""): string {
  if (!/data-lesson-interaction\s*=/i.test(html) && !/id\s*=\s*["']websuli-lesson-data["']/i.test(html)) return html;
  // Leave the previously immutable URL once; the stable entry now revalidates on each load.
  const tags = `<script id="websuli-interactions" type="module" src="${origin}/lesson-interactions.js?v=2"></script>`;
  const ranges: { startOffset: number; endOffset: number }[] = [];
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    if (node.nodeName === "script" && "attrs" in node && node.attrs.some(a => a.name === "id" && a.value === "websuli-interactions") && node.sourceCodeLocation) ranges.push(node.sourceCodeLocation);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parse(html, { sourceCodeLocationInfo: true }));
  for (const range of ranges.sort((a, b) => b.startOffset - a.startOffset)) html = html.slice(0, range.startOffset) + html.slice(range.endOffset);
  return /<\/head\s*>/i.test(html) ? html.replace(/<\/head\s*>/i, `${tags}</head>`) : tags + html;
}
export const HTML_INTERACTION_CONTRACT = `Témához illő opcionális közös interakció: <div data-lesson-interaction="triangleArea" data-params='{"base":6,"height":4,"unit":"cm"}' data-caption="Mitől változik a terület?"></div>. Csak a forrásban tanított alap/magasság adataival, base/height 0.1–1000, unit cm vagy m. A közös futtató biztosítja a jóslás–kísérlet–magyarázatot, ne generálj hozzá saját JavaScriptet.
Döntési történet: ugyanilyen div data-lesson-interaction="decisionStory", data-params a történet JSON-ja; az attribútumot HTML-biztosan kódold. ${DECISION_STORY_CONTRACT}
A beillesztett div helyén a készítő/javító adapter tölti be a közös modult. Használd, ha segíti a megértést; önmagáért ne adj laborblokkot egy nem kapcsolódó témához.`;
