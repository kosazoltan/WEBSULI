import {
  hasHtmlLessonData,
  readRawHtmlLessonData,
  readHtmlLessonData,
} from "../../shared/lesson-html-data";
import { LESSON_METHOD_VERSION } from "../../shared/lesson-experience";
import { verifyLessonMethodHtml } from "../improve/verify-lesson-method";

export type WebLessonQualityNotice = {
  kind: "legacy" | "invalid";
  message: string;
};

/**
 * Classifies an already stored HTML preview without changing its content.
 * Old material remains readable, but cannot look like a current v7.4-4 release.
 */
export function webLessonQualityNotice(html: string): WebLessonQualityNotice | null {
  if (!hasHtmlLessonData(html)) return null;

  let rawVersion: unknown;
  try {
    const raw = readRawHtmlLessonData(html);
    rawVersion = (raw as { experience?: { version?: unknown } })?.experience?.version;
    const data = readHtmlLessonData(html);
    const check = verifyLessonMethodHtml(html);
    if (data.experience.version === LESSON_METHOD_VERSION && check.ok) return null;

    if (data.experience.version !== LESSON_METHOD_VERSION) {
      return {
        kind: "legacy",
        message:
          "Ez egy korábbi módszerverziójú előnézet, ezért nem minősül új, ellenőrzött WebSuli-kiadásnak. Az új internetes tananyag minimuma 45 szöveges feladat, 75 kvízkérdés, 15/25-ös kör és mind a tíz módszer.",
      };
    }

    return {
      kind: "invalid",
      message:
        "Ez az előnézet nem teljesítette a WebSuli 7.4 minőségkapuját, ezért nem minősül ellenőrzött kiadásnak. A hiányos tananyag nem publikálható új internetes anyagként.",
    };
  } catch {
    if (rawVersion && rawVersion !== LESSON_METHOD_VERSION) {
      return {
        kind: "legacy",
        message:
          "Ez egy korábbi módszerverziójú előnézet, ezért nem minősül új, ellenőrzött WebSuli-kiadásnak. Az új internetes tananyag minimuma 45 szöveges feladat, 75 kvízkérdés, 15/25-ös kör és mind a tíz módszer.",
      };
    }
    return {
      kind: "invalid",
      message:
        "Ez az előnézet sérült vagy hiányos WebSuli-adatot tartalmaz, ezért nem minősül ellenőrzött kiadásnak.",
    };
  }
}

const noticeStyle =
  "margin:0 0 1rem;padding:0.85rem 1rem;border:2px solid #b42318;border-radius:0.75rem;background:#fff1f0;color:#7a271a;font:600 1rem/1.45 system-ui,sans-serif;box-sizing:border-box;";

/** Adds only a static status banner; lesson data and scripts stay byte-for-byte intact. */
export function prependWebLessonQualityNotice(
  html: string,
  notice: WebLessonQualityNotice,
): string {
  const banner = `<aside data-lesson-quality-notice="${notice.kind}" role="status" style="${noticeStyle}">${notice.message}</aside>`;
  if (/<body(?:\s[^>]*)?>/i.test(html)) return html.replace(/(<body(?:\s[^>]*)?>)/i, `$1${banner}`);
  return `${banner}${html}`;
}
