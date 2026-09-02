// natural-language-query.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  PackageSearch,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Table2,
  Terminal,
  XCircle,
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

type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error"
  | string;

interface ToolPartShape {
  type: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  toolName?: string;
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
    isAutomatic?: boolean;
  };
}

interface ApprovalCallback {
  (args: { id: string; approved: boolean; reason?: string }): void;
}

/** A single tool call rendered as a card inside the assistant message. */
function ToolCallCard({
  part,
  onApprovalResponse,
}: {
  part: ToolPartShape;
  onApprovalResponse?: ApprovalCallback;
}) {
  const toolName = part.type.replace(/^tool-/, "");

  // Special Interactive Human-in-the-Loop approval card for stock mutations
  if (toolName === "updateProductStock") {
    const inputData = (part.input ?? {}) as {
      productTitle?: string;
      newQuantity?: number;
      reason?: string;
      variantId?: string;
    };
    const outputData = (part.output ?? {}) as {
      status?: string;
      message?: string;
      quantityOnHand?: number;
      inventoryState?: string;
    };

    if (part.state === "approval-requested") {
      return (
        <div className="mt-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-4 shrink-0" />
            <span>Action Confirmation Required</span>
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
            >
              Guarded Action
            </Badge>
          </div>
          <div className="mt-2 space-y-1 text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">Product:</span>{" "}
              {inputData.productTitle || "Catalogue Variant"}
            </div>
            <div>
              <span className="font-semibold text-foreground">New Stock Quantity:</span>{" "}
              <span className="font-mono font-medium text-foreground">
                {inputData.newQuantity ?? "?"} units
              </span>
            </div>
            {inputData.reason && (
              <div>
                <span className="font-semibold text-foreground">Reason:</span> {inputData.reason}
              </div>
            )}
          </div>
          {part.approval?.id && onApprovalResponse && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 gap-1.5 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                onClick={() => onApprovalResponse({ id: part.approval!.id, approved: true })}
              >
                <CheckCircle2 className="size-3.5" />
                Approve & Update
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-border px-3 text-xs hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onApprovalResponse({ id: part.approval!.id, approved: false })}
              >
                <XCircle className="size-3.5" />
                Deny
              </Button>
            </div>
          )}
        </div>
      );
    }

    if (part.state === "approval-responded") {
      const isApproved = part.approval?.approved;
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          {isApproved ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>Approved by seller. Applying inventory update...</span>
            </>
          ) : (
            <>
              <XCircle className="size-3.5 text-muted-foreground" />
              <span>Stock update cancelled by seller.</span>
            </>
          )}
        </div>
      );
    }

    if (part.state === "output-available") {
      return (
        <div className="mt-2.5 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>Inventory Updated</span>
            <Badge
              variant="outline"
              className="ml-auto border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              Executed
            </Badge>
          </div>
          <p className="mt-1.5 text-muted-foreground">
            {outputData.message ||
              `Successfully set stock to ${outputData.quantityOnHand} units (${outputData.inventoryState ?? "updated"}).`}
          </p>
        </div>
      );
    }

    if (part.state === "output-denied") {
      return (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-muted bg-muted/20 p-2.5 text-xs text-muted-foreground">
          <XCircle className="size-3.5 text-muted-foreground" />
          <span>Action was denied. No database changes were made.</span>
        </div>
      );
    }
  }

  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";

  const input = part.input as Record<string, unknown> | undefined;
  const output = part.output as
    | {
        status?: string;
        count?: number;
        total?: number;
        products?: unknown[];
        rowCount?: number;
        tables?: unknown[];
        message?: string;
      }
    | undefined;

  const icon =
    toolName === "searchProducts" ? (
      <PackageSearch className="size-3.5" />
    ) : toolName === "queryDatabase" ? (
      <Database className="size-3.5" />
    ) : toolName === "getSchema" ? (
      <Table2 className="size-3.5" />
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
            : output?.tables !== undefined
              ? `${(output.tables as unknown[]).length} column(s) listed`
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

function MessageBubble({
  message,
  onApprovalResponse,
}: {
  message: UIMessage;
  onApprovalResponse?: ApprovalCallback;
}) {
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
            return (
              <ToolCallCard
                key={index}
                part={part as unknown as ToolPartShape}
                onApprovalResponse={onApprovalResponse}
              />
            );
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

  const { addToolApprovalResponse, error, messages, sendMessage, status } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
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
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onApprovalResponse={addToolApprovalResponse}
              />
            ))
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
