// natural-language-query.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertTriangle,
  Bot,
  Database,
  Loader2,
  PackageSearch,
  Search,
  Send,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const suggestedQueries = [
  "Which products are out of stock?",
  "Show me my 5 cheapest products",
  "How many active products do I have?",
  "What's the price range of my catalogue?",
  "List products tagged summer",
];

type ToolState = "input-streaming" | "input-available" | "output-available" | "output-error" | string;

interface ToolPartShape {
  type: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
}

/** A single tool call rendered as a card inside the assistant message. */
function ToolCallCard({ part }: { part: ToolPartShape }) {
  const toolName = part.type.replace(/^tool-/, "");

  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";

  const input = part.input as Record<string, unknown> | undefined;
  const output = part.output as
    | { status?: string; count?: number; total?: number; products?: unknown[]; rowCount?: number; message?: string }
    | undefined;

  const icon =
    toolName === "searchProducts" ? (
      <PackageSearch className="size-3.5" />
    ) : toolName === "queryDatabase" ? (
      <Database className="size-3.5" />
    ) : (
      <Terminal className="size-3.5" />
    );

  const summary = running
    ? "Running…"
    : failed
      ? part.errorText ?? "Tool failed"
      : output?.status === "error"
        ? output.message ?? "No result"
        : output?.products !== undefined
          ? `${output.count ?? output.products.length} product(s) found (${output.total ?? "?"} total)`
          : output?.rowCount !== undefined
            ? `${output.rowCount} row(s) returned`
            : "Done";

  return (
    <div
      className={cn(
        "mt-1.5 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
        failed
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : running
            ? "border-primary/20 bg-primary/5 text-muted-foreground"
            : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <span className="shrink-0">{running ? <Loader2 className="size-3.5 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{toolName}</span>
        {running && input ? (
          <span className="ml-1.5 truncate">— {String((input as Record<string, unknown>).query ?? "")}</span>
        ) : null}
      </span>
      <span className="shrink-0 font-medium">{summary}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-foreground",
        )}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <p key={index} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }

          if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
            return <ToolCallCard key={index} part={part as unknown as ToolPartShape} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}

export function NaturalLanguageQuery() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`
    : "http://localhost:4000/api/v1/copilot/chat";

  const { error, messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: apiUrl,
      // The API requires a Supabase access token on every copilot call — the
      // chat streams through tools that read seller data. Resolve the session
      // per request so a fresh token is sent even after a refresh.
      headers: async () => {
        const { data } = await createClient().auth.getSession();
        return {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        };
      },
    }),
  });

  const isProcessing = status === "streaming" || status === "submitted";

  // Keep the newest message in view while streaming.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isProcessing) return;
    sendMessage({ text: suggestion });
  };

  return (
    <Card className="flex min-h-[540px] flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bot className="size-4 text-muted-foreground" />
          Ask Your AI Assistant
        </CardTitle>
        <Badge variant="outline" className="gap-1 text-[10px]">
          {isProcessing ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Streaming…
            </>
          ) : (
            <>
              <Sparkles className="size-3" /> AI SDK Active
            </>
          )}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden">
        {/* Conversation */}
        <div
          ref={scrollRef}
          className="flex max-h-[420px] flex-1 flex-col gap-3 overflow-y-auto pr-1"
        >
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
              <Bot className="size-8 text-muted-foreground/40" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Ask about your catalogue — products, stock levels, prices — and the
                copilot will answer from your real data using its tools.
              </p>
            </div>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}

          {error && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" />
              {error.message}
            </div>
          )}
        </div>

        {/* Suggested queries */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestedQueries.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isProcessing}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Ask about your products, stock, prices…"
              className="pl-9 pr-4"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <Button type="submit" disabled={isProcessing || !input.trim()}>
            {isProcessing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
