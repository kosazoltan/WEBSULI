export type WebSource = { url: string; title: string };
export type WebResearchEvent =
  | { type: "content_delta" | "content_replace"; content: string }
  | { type: "status"; message: string }
  | { type: "sources"; sources: WebSource[] }
  | { type: "html_generated"; html: string; sources: WebSource[]; warnings?: string[] }
  | { type: "error"; message: string }
  | { type: "complete" };
export type WebResearchArtifact = Extract<WebResearchEvent, { type: "html_generated" }>;

/** Require both the artifact and explicit server completion. EOF alone is not success. */
export async function consumeWebResearchStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: WebResearchEvent) => void,
): Promise<WebResearchArtifact> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let artifact: WebResearchArtifact | undefined;
  let completed = false;
  const consume = (part: string) => {
    const data = part.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") return;
    let event: WebResearchEvent;
    try { event = JSON.parse(data) as WebResearchEvent; }
    catch { throw new Error("A szerver hibás választ küldött. Nem készült menthető tananyag."); }
    if (!event || typeof event.type !== "string") throw new Error("A szerver hibás eseményt küldött.");
    if (event.type === "error") throw new Error(event.message || "A tananyagkészítés hibával megállt.");
    if (event.type === "html_generated" && typeof event.html === "string" && event.html.trim()) artifact = event;
    if (event.type === "complete") completed = true;
    onEvent(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) consume(part);
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error("A kapcsolat megszakadt a tananyagkészítés befejezése előtt. Próbáld újra a készítést.");
    if (!artifact) throw new Error("A keresés lezárult, de nem készült tananyag. Próbáld újra a készítést.");
    return artifact;
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
