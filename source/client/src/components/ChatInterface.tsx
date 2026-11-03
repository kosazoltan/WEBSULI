import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, User, Bot } from "lucide-react";
import { parseChatMarkdown, type ChatInline } from "@/lib/chat-markdown";

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatInterfaceProps {
  title: string;
  description?: string;
  messages: ChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  isLoading?: boolean;
  placeholder?: string;
  aiName?: string;
  aiIcon?: React.ReactNode;
  disabled?: boolean;
}

function Inlines({ inlines }: { inlines: ChatInline[] }) {
  return <>{inlines.map((inline, index) => (inline.bold ? <strong key={index}>{inline.text}</strong> : <span key={index}>{inline.text}</span>))}</>;
}

// Agent replies arrive as markdown; render the safe subset as elements so no raw "**" reaches the reader.
function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 break-words">
      {parseChatMarkdown(content).map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="list-disc pl-5 space-y-1">
            {block.items.map((item, itemIndex) => <li key={itemIndex}><Inlines inlines={item} /></li>)}
          </ul>
        ) : (
          <p key={index} className={`whitespace-pre-wrap ${block.kind === "heading" ? "font-semibold" : ""}`}>
            <Inlines inlines={block.inlines} />
          </p>
        ),
      )}
    </div>
  );
}

export default function ChatInterface({
  title,
  description,
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Írj üzenetet…",
  aiIcon,
  disabled = false
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive.
  // A scrollRef a Radix ScrollArea Root elemére mutat, aminek overflow: hidden van —
  // a tényleges görgethető konténer a belső [data-radix-scroll-area-viewport] div.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLDivElement>(
      '[data-radix-scroll-area-viewport]'
    );
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || disabled) return;
    
    const messageText = input.trim();
    setInput("");
    
    // Reset textarea height and scroll, so the placeholder shows from its first line again
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.scrollTop = 0;
    }
    
    await onSendMessage(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    // min-h-0 on every flex level: without it the message list grows to its content height,
    // spills out of the fixed-height parent and covers the controls below it (mobile, 2026-11-03).
    <Card className="flex flex-col h-full min-h-0 overflow-hidden" data-testid="chat-interface">
      <CardHeader className="p-3 pb-1 sm:p-6 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          {aiIcon}
          {title}
        </CardTitle>
        {description && <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>}
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 min-h-0 gap-3 p-3 sm:gap-4 sm:p-4">
        {/* Messages area */}
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 min-h-0 pr-2 sm:pr-4"
          data-testid="chat-messages-scroll"
        >
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>Kezdd el a beszélgetést!</p>
              </div>
            ) : (
              messages
                .filter(msg => msg.role !== 'system')
                .map((msg, index) => (
                  <div
                    key={index}
                    className={`flex gap-2 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`chat-message-${msg.role}-${index}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        {aiIcon || <Bot className="w-8 h-8 p-1.5 rounded-full bg-primary text-primary-foreground" />}
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[88%] sm:max-w-[80%] min-w-0 rounded-lg px-3 py-2 sm:px-4 text-sm sm:text-base ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      {msg.role === 'assistant' ? <ChatMarkdown content={msg.content} /> : <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                    </div>
                    
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0">
                        <User className="w-6 h-6 p-1 sm:w-8 sm:h-8 sm:p-1.5 rounded-full bg-primary text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))
            )}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  {aiIcon || <Bot className="w-8 h-8 p-1.5 rounded-full bg-primary text-primary-foreground animate-pulse" />}
                </div>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input area */}
        <div className="flex shrink-0 gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            className="min-w-0 min-h-[60px] max-h-[200px] resize-none"
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || disabled}
            size="icon"
            className="flex-shrink-0 w-[52px] h-[52px] sm:w-[60px] sm:h-[60px]"
            data-testid="chat-send-button"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
