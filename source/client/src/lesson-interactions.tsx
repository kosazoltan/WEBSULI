import { createRoot } from "react-dom/client";
import { TriangleAreaLab } from "./lesson-runtime/blocks/TriangleAreaLab";
import { DecisionStory } from "./lesson-runtime/blocks/DecisionStory";
import triangleStyles from "./lesson-runtime/triangle-lab.css?inline";
import storyStyles from "./lesson-runtime/decision-story.css?inline";
import { HtmlLessonQuiz } from "./lesson-runtime/HtmlLessonQuiz";
import { HtmlLessonTasks } from "./lesson-runtime/HtmlLessonTasks";
import { htmlLessonDataSchema } from "@shared/lesson-html-data";

const style = document.createElement("style");
style.textContent = triangleStyles + storyStyles;
document.head.append(style);

// Module scripts run after the legacy inline renderer. Replace its children, preserving the tab container.
const quizPanel = document.querySelector<HTMLElement>('[data-lesson-panel="quiz"]');
const bankElement = document.getElementById("websuli-lesson-data");
if (quizPanel && bankElement) {
  try {
    const data = htmlLessonDataSchema.parse(JSON.parse(bankElement.textContent ?? ""));
    const root = document.createElement("div");
    quizPanel.replaceChildren(root);
    createRoot(root).render(<HtmlLessonQuiz experience={data.experience} material={location.pathname} />);
    const tasksPanel = document.querySelector<HTMLElement>('[data-lesson-panel="tasks"]');
    if (tasksPanel) {
      const tasksRoot = document.createElement("div");
      tasksPanel.replaceChildren(tasksRoot);
      createRoot(tasksRoot).render(<HtmlLessonTasks experience={data.experience} material={location.pathname} />);
    }
  } catch { quizPanel.textContent = "A kvíz adatai hibásak, ezért nem indítható pontozott kör."; }
}

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
