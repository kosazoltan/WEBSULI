import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, User, Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export default function ChatInterface({
  title,
  description,
  messages,
  onSendMessage,
  isLoading = false,
  placeholder = "Írj üzenetet...",
  aiName = "AI",
  aiIcon,
  disabled = false
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
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
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {aiIcon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      
      <CardContent className="flex flex-col flex-1 gap-4 p-4">
        {/* Messages area */}
        <ScrollArea 
          ref={scrollRef}
          className="flex-1 pr-4"
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
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    data-testid={`chat-message-${msg.role}-${index}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        {aiIcon || <Bot className="w-8 h-8 p-1.5 rounded-full bg-primary text-primary-foreground" />}
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    
                    {msg.role === 'user' && (
                      <div className="flex-shrink-0">
                        <User className="w-8 h-8 p-1.5 rounded-full bg-primary text-primary-foreground" />
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
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || disabled}
            className="min-h-[60px] max-h-[200px] resize-none"
            data-testid="chat-input"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || disabled}
            size="icon"
            className="flex-shrink-0 w-[60px] h-[60px]"
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
