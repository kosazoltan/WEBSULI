// Minimal, safe markdown for chat bubbles: **bold**, "- " lists and "#" headings become structure,
// never HTML strings (no dangerouslySetInnerHTML). Anything else stays plain text.
export type ChatInline = { text: string; bold: boolean };
export type ChatBlock =
  | { kind: "heading" | "paragraph"; inlines: ChatInline[] }
  | { kind: "list"; items: ChatInline[][] };

export function parseChatInline(text: string): ChatInline[] {
  const parts = text.split("**");
  // An odd number of markers would leave the last one unpaired: keep it as literal text.
  if (parts.length % 2 === 0) {
    const last = parts.pop()!;
    parts[parts.length - 1] += `**${last}`;
  }
  return parts.map((part, index) => ({ text: part, bold: index % 2 === 1 })).filter((inline) => inline.text !== "");
}

const LIST_ITEM = /^\s*(?:[-*•])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseChatMarkdown(text: string): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", inlines: parseChatInline(paragraph.join("\n")) });
    paragraph = [];
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const item = LIST_ITEM.exec(line);
    const heading = HEADING.exec(line);
    if (item) {
      flush();
      const previous = blocks[blocks.length - 1];
      if (previous?.kind === "list") previous.items.push(parseChatInline(item[1]));
      else blocks.push({ kind: "list", items: [parseChatInline(item[1])] });
    } else if (heading) {
      flush();
      blocks.push({ kind: "heading", inlines: parseChatInline(heading[1]) });
    } else if (line.trim() === "") {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
