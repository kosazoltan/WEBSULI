import { createHash } from "node:crypto";
import type { HtmlFile } from "../../shared/schema";

export function htmlBaselineHash(file: Pick<HtmlFile, "content" | "title" | "description" | "classroom" | "contentType">) {
  return createHash("sha256").update(JSON.stringify([file.content, file.title, file.description, file.classroom, file.contentType])).digest("hex");
}
