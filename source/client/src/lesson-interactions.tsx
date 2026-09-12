import { CognitiveMethods } from "./lesson-runtime/CognitiveMethods";
import experienceStyles from "./lesson-runtime/lesson-experience.css?inline";
import gradeStyles from "./lesson-runtime/lesson-grade.css?inline";
import { learningAgeGroup } from "@shared/lesson-band";
import { ageBandForClassroom } from "@shared/lesson-schema";
import { createRoot } from "react-dom/client";
import { TriangleAreaLab } from "./lesson-runtime/blocks/TriangleAreaLab";
import { DecisionStory } from "./lesson-runtime/blocks/DecisionStory";
import triangleStyles from "./lesson-runtime/triangle-lab.css?inline";
import storyStyles from "./lesson-runtime/decision-story.css?inline";
import { HtmlLessonQuiz } from "./lesson-runtime/HtmlLessonQuiz";
import { HtmlLessonTasks } from "./lesson-runtime/HtmlLessonTasks";
import { htmlLessonDataSchema } from "@shared/lesson-html-data";

const style = document.createElement("style");
style.textContent = triangleStyles + storyStyles + experienceStyles + gradeStyles;
document.head.append(style);

// Module scripts run after the legacy inline renderer. Replace its children, preserving the tab container.
const quizPanel = document.querySelector<HTMLElement>('[data-lesson-panel="quiz"]');
const bankElement = document.getElementById("websuli-lesson-data");
if (quizPanel && bankElement) {
  try {
    const data = htmlLessonDataSchema.parse(JSON.parse(bankElement.textContent ?? ""));
    document.body.dataset.band = ageBandForClassroom(data.classroom);
    document.body.dataset.experience = data.experience.theme;
    document.body.dataset.learningAge = learningAgeGroup(data.classroom);
    document.body.classList.add("websuli-html-lesson");
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('button[data-lesson-tab]')];
    const panels = [...document.querySelectorAll<HTMLElement>('[data-lesson-panel]')];
    if (tabs.length === 4 && panels.length === 4) {
      const navigation = tabs[0].parentElement;
      if (navigation && tabs.every(tab => tab.parentElement === navigation)) navigation.dataset.websuliTabs = "true";
      const select = (name: string) => {
        for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.lessonTab === name));
        for (const panel of panels) {
          const active = panel.dataset.lessonPanel === name;
          panel.hidden = !active;
          panel.style.display = active ? "block" : "none";
        }
      };
      // Own navigation as well as rendering: generated inline handlers cannot reset a React bank.
      for (const tab of tabs) tab.addEventListener("click", event => {
        event.preventDefault(); event.stopImmediatePropagation(); select(tab.dataset.lessonTab!);
      }, { capture: true });
      select("teaching");
    }
    const methodsPanel = document.querySelector<HTMLElement>('[data-lesson-panel="methods"]');
    if (methodsPanel) {
      const methodsRoot = document.createElement("div");
      methodsRoot.className = "fusion-view";
      methodsPanel.replaceChildren(methodsRoot);
      createRoot(methodsRoot).render(<CognitiveMethods methods={data.experience.methods} embedded />);
    }
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
