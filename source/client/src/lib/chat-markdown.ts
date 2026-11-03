// Minimal, safe markdown for chat bubbles: **bold**, "- " lists and "#" headings become structure,
// never HTML strings (no dangerouslySetInnerHTML). Anything else stays plain text.
export type ChatInline = { text: string; bold: boolean };
export type ChatBlock =
  | { kind: "heading" | "paragraph"; inlines: ChatInline[] }
  | { kind: "list"; items: ChatInline[][] };

// A bubble shows at most this much of a reply (the tail, where the newest progress is): an unusually long,
// list-heavy reply would otherwise become tens of thousands of DOM nodes and freeze a phone (review #390).
export const CHAT_MARKDOWN_MAX_CHARS = 8000;

// Markdown delimiter rule: the opening ** is followed and the closing ** preceded by a non-space,
// so spaced operators such as "2 ** 3 ** 4" stay literal text.
const BOLD = /\*\*(?=\S)([\s\S]*?\S)\*\*/g;

export function parseChatInline(text: string): ChatInline[] {
  const inlines: ChatInline[] = [];
  let last = 0;
  for (const match of text.matchAll(BOLD)) {
    if (match.index > last) inlines.push({ text: text.slice(last, match.index), bold: false });
    inlines.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) inlines.push({ text: text.slice(last), bold: false });
  return inlines;
}

const LIST_ITEM = /^\s*(?:[-*•])\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseChatMarkdown(text: string): ChatBlock[] {
  let source = text.replace(/\r\n?/g, "\n");
  if (source.length > CHAT_MARKDOWN_MAX_CHARS) {
    const tail = source.slice(-CHAT_MARKDOWN_MAX_CHARS);
    source = `…\n${tail.slice(tail.indexOf("\n") + 1)}`;
  }
  const blocks: ChatBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", inlines: parseChatInline(paragraph.join("\n")) });
    paragraph = [];
  };
  for (const line of source.split("\n")) {
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
