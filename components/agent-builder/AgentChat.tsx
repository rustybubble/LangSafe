"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Send, Loader2, Bot, User, Sparkles, Database } from "lucide-react";
import ReactMarkdown from "react-markdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentChatProps {
  languageCode?: string;
  languageName?: string;
}

// ---------------------------------------------------------------------------
// Tool label mapping
// ---------------------------------------------------------------------------

const TOOL_LABELS: Record<string, string> = {
  "platform.core.search": "Searching Elasticsearch...",
  "platform.core.generate_esql": "Generating ES|QL query...",
  "platform.core.execute_esql": "Running ES|QL query...",
  "platform.core.list_indices": "Discovering indices...",
  "platform.core.get_index_mapping": "Reading index schema...",
  "platform.core.get_document_by_id": "Fetching document...",
};

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

function getSuggestions(languageName?: string): string[] {
  if (languageName) {
    return [
      `What ${languageName} words have been preserved so far?`,
      `Show me ${languageName} grammar patterns`,
      `What sources were used for ${languageName}?`,
    ];
  }
  return [
    "What words have been preserved so far?",
    "How many nearly extinct languages exist?",
    "Show me common grammar patterns",
  ];
}

// ---------------------------------------------------------------------------
// SSE parser helper
// ---------------------------------------------------------------------------

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

function parseSSEEvents(buffer: string): { events: SSEEvent[]; remaining: string } {
  const parts = buffer.split("\n\n");
  const remaining = parts.pop() || "";
  const events: SSEEvent[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;
    const lines = part.split("\n");

    // Extract the event type from "event: <name>" line
    const eventLine = lines.find((l) => l.startsWith("event:"));
    const type = eventLine ? eventLine.slice(6).trim() : "unknown";

    // Extract the JSON payload from "data: <json>" line
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (!dataLine) continue;

    try {
      const parsed = JSON.parse(dataLine.slice(5).trim());
      // Kibana wraps the payload in a `data` envelope — unwrap it
      const payload = parsed.data ?? parsed;
      events.push({ type, data: payload });
    } catch {
      // skip malformed events
    }
  }

  return { events, remaining };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentChat({ languageCode, languageName }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [reasoningText, setReasoningText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isStreaming, toolStatus]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    setInput("");
    setError(null);
    setToolStatus(null);
    setReasoningText(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);
    setIsStreaming(false);

    try {
      const res = await fetch("/api/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          language_code: languageCode,
          language_name: languageName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error || "Something went wrong");
        setIsLoading(false);
        return;
      }

      if (!res.body) {
        setError("No response stream received");
        setIsLoading(false);
        return;
      }

      // Read the SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remaining } = parseSSEEvents(buffer);
        buffer = remaining;

        for (const evt of events) {
          const { type, data } = evt;

          // Debug: log every SSE event
          console.log(`[AgentChat] SSE event: ${type}`, JSON.stringify(data).slice(0, 200));

          if (type === "conversation_id_set" || type === "conversation_created") {
            const id = data.conversation_id as string | undefined;
            if (id) setConversationId(id);
          }

          if (type === "reasoning") {
            const text = (data.reasoning ?? "") as string;
            const transient = data.transient as boolean | undefined;
            if (text && !transient) {
              setReasoningText(text);
            }
          }

          if (type === "thinking_complete") {
            setReasoningText(null);
          }

          if (type === "tool_call") {
            const toolId = (data.tool_id ?? "") as string;
            setToolStatus(TOOL_LABELS[toolId] || "Querying Elasticsearch...");
          }

          if (type === "tool_progress") {
            // Keep tool status visible during progress
          }

          if (type === "tool_result") {
            setToolStatus(null);
          }

          if (type === "message_chunk") {
            // Try both direct and nested paths for robustness
            const chunk = (data.text_chunk ?? (data as Record<string, Record<string, unknown>>).data?.text_chunk ?? "") as string;
            if (!chunk) {
              console.warn("[AgentChat] message_chunk has no text_chunk. Keys:", Object.keys(data));
              continue;
            }

            if (!assistantAdded) {
              assistantAdded = true;
              setIsStreaming(true);
              setToolStatus(null);
              setMessages((prev) => [...prev, { role: "assistant", content: chunk }]);
            } else {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + chunk };
                }
                return next;
              });
            }
          }

          if (type === "message_complete") {
            setToolStatus(null);
            // Fallback: if streaming didn't work, show the full message
            const fullContent = (data.message_content ?? (data as Record<string, Record<string, unknown>>).data?.message_content ?? "") as string;
            if (!assistantAdded && fullContent) {
              assistantAdded = true;
              setIsStreaming(true);
              setMessages((prev) => [...prev, { role: "assistant", content: fullContent }]);
            }
          }

          if (type === "round_complete") {
            setToolStatus(null);
          }
        }
      }
    } catch {
      setError("Failed to reach the agent. Please try again.");
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      setToolStatus(null);
      inputRef.current?.focus();
    }
  }, [input, isLoading, conversationId, languageCode, languageName]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const showThinking = isLoading && !isStreaming;

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="px-5 py-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mb-3 text-primary/40" />
              <p className="text-sm font-medium mb-1">LangSafe Linguist</p>
              <p className="text-xs max-w-[280px]">
                Ask about endangered language vocabulary, grammar patterns, or
                explore 5,352 languages worldwide.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {getSuggestions(languageName).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="text-[11px] px-2.5 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2.5",
                msg.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-2 prose-pre:my-1 prose-code:text-xs">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 mt-0.5">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Thinking / tool status indicator */}
          {showThinking && (
            <div className="flex gap-2.5">
              <div className="flex-shrink-0 mt-0.5">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>
              <div className="bg-muted/60 rounded-xl px-3.5 py-2.5 max-w-[85%]">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking...
                  </div>
                  {reasoningText && (
                    <p className="text-[11px] text-muted-foreground/70 italic leading-relaxed">
                      {reasoningText}
                    </p>
                  )}
                  {toolStatus && (
                    <div className="flex items-center gap-1.5 text-[11px] text-primary/70">
                      <Database className="h-2.5 w-2.5" />
                      {toolStatus}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tool status while streaming */}
          {isStreaming && toolStatus && (
            <div className="flex items-center gap-1.5 text-[11px] text-primary/70 pl-8">
              <Database className="h-2.5 w-2.5" />
              {toolStatus}
            </div>
          )}

          {error && (
            <div className="text-center">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about vocabulary, grammar, or languages..."
            disabled={isLoading}
            className="flex-1 text-sm"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 h-9 w-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          Powered by Featherless.ai
        </p>
      </div>
    </div>
  );
}
