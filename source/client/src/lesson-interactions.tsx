import { createRoot } from "react-dom/client";
import { TriangleAreaLab } from "./lesson-runtime/blocks/TriangleAreaLab";
import { DecisionStory } from "./lesson-runtime/blocks/DecisionStory";
import triangleStyles from "./lesson-runtime/triangle-lab.css?inline";
import storyStyles from "./lesson-runtime/decision-story.css?inline";

const style = document.createElement("style");
style.textContent = triangleStyles + storyStyles;
document.head.append(style);

/** Shared audited renderers for generated HTML; model output supplies JSON data only. */
for (const element of document.querySelectorAll<HTMLElement>("[data-lesson-interaction]")) {
  try {
    const params = JSON.parse(element.dataset.params ?? "{}");
    const caption = element.dataset.caption ?? "Próbáld ki, majd magyarázd el!";
    const Component = element.dataset.lessonInteraction === "triangleArea" ? TriangleAreaLab
      : element.dataset.lessonInteraction === "decisionStory" ? DecisionStory : null;
    if (Component) createRoot(element).render(<Component params={params} caption={caption} />);
  } catch { element.textContent = "Ez a szemléltetés most nem tölthető be. Folytasd a kidolgozott példával!"; }
}
