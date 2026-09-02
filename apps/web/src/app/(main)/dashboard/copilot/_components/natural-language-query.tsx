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
  ArrowUp,
  Bot,
  CheckCircle2,
  Database,
  Loader2,
  Package,
  PackageSearch,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Table2,
  Terminal,
  TrendingUp,
  Truck,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const SUGGESTIONS = [
  {
    icon: Package,
    title: "Check Low Stock",
    prompt: "Which products are currently low or out of stock?",
  },
  {
    icon: TrendingUp,
    title: "Price & Value Insights",
    prompt: "Show me my 5 most expensive products and their stock levels.",
  },
  {
    icon: Truck,
    title: "Courier Performance",
    prompt: "What are the courier delivery success rates for Lahore and Karachi?",
  },
  {
    icon: Database,
    title: "Catalog Health",
    prompt: "What is the total number of active products and variants in my store?",
  },
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

/** Renders a single tool call or approval card inside an assistant message. */
function ToolCallCard({
  part,
  onApprovalResponse,
}: {
  part: ToolPartShape;
  onApprovalResponse?: ApprovalCallback;
}) {
  const toolName = part.type.replace(/^tool-/, "");

  // Native Vercel AI SDK Human-in-the-Loop approval cards for guarded mutations
  if (
    toolName === "mutateDatabase" ||
    toolName === "updateProductStock" ||
    toolName === "updateProductPrice" ||
    toolName === "updateProductDetails"
  ) {
    const inputData = (part.input ?? {}) as Record<string, unknown>;
    const outputData = (part.output ?? {}) as Record<string, unknown>;

    const actionTitle =
      toolName === "mutateDatabase"
        ? "Action Approval: Database Mutation"
        : toolName === "updateProductStock"
          ? "Action Approval: Adjust Stock Level"
          : toolName === "updateProductPrice"
            ? "Action Approval: Update Selling Price"
            : "Action Approval: Update Product Details";

    const executedTitle =
      toolName === "mutateDatabase"
        ? "Database Mutation Committed"
        : toolName === "updateProductStock"
          ? "Stock Level Updated"
          : toolName === "updateProductPrice"
            ? "Price Updated"
            : "Product Details Updated";

    if (part.state === "approval-requested") {
      return (
        <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
            <ShieldAlert className="size-4 shrink-0" />
            <span className="text-sm font-semibold">{actionTitle}</span>
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
            >
              Guarded Action
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            The Copilot is requesting your authorization before writing these changes to your store database:
          </p>

          <div className="mt-3 rounded-lg border border-border/60 bg-background/80 p-2.5">
            {toolName === "mutateDatabase" ? (
              <div className="space-y-2">
                <div>
                  <span className="text-muted-foreground">Proposed Change:</span>
                  <p className="font-semibold text-foreground">
                    {String(inputData.summary || "Database Mutation")}
                  </p>
                </div>
                {Boolean(inputData.sql) ? (
                  <div>
                    <span className="text-muted-foreground">SQL Statement:</span>
                    <pre className="mt-1 overflow-x-auto rounded border border-border/40 bg-muted/60 p-2 font-mono text-[11px] text-foreground">
                      {String(inputData.sql)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Product:</span>
                  <p className="truncate font-semibold text-foreground">
                    {String(inputData.productTitle || inputData.currentTitle || "Catalogue Item")}
                  </p>
                </div>

                {toolName === "updateProductStock" && (
                  <div>
                    <span className="text-muted-foreground">Target Stock:</span>
                    <p className="font-mono font-semibold text-foreground">
                      {String(inputData.newQuantity ?? "?")} units
                    </p>
                  </div>
                )}

                {toolName === "updateProductPrice" && (
                  <div>
                    <span className="text-muted-foreground">New Price:</span>
                    <p className="font-mono font-semibold text-foreground">
                      Rs. {Number(inputData.newPricePkr ?? 0).toLocaleString()}
                    </p>
                  </div>
                )}

                {toolName === "updateProductDetails" && Boolean(inputData.newTitle) ? (
                  <div>
                    <span className="text-muted-foreground">New Name:</span>
                    <p className="truncate font-semibold text-foreground">
                      {String(inputData.newTitle)}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {Boolean(inputData.reason) ? (
              <div className="mt-2 border-t border-border/40 pt-1.5">
                <span className="text-muted-foreground">Reason:</span>{" "}
                <span className="text-foreground">{String(inputData.reason)}</span>
              </div>
            ) : null}
          </div>

          {part.approval?.id && onApprovalResponse && (
            <div className="mt-3.5 flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-emerald-600 px-3.5 text-xs text-white hover:bg-emerald-700"
                onClick={() => onApprovalResponse({ id: part.approval!.id, approved: true })}
              >
                <CheckCircle2 className="size-3.5" />
                Approve & Update
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-border px-3.5 text-xs hover:bg-destructive/10 hover:text-destructive"
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
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {isApproved ? (
            <>
              <Loader2 className="size-3.5 animate-spin text-primary" />
              <span>Approved by merchant. Executing database update...</span>
            </>
          ) : (
            <>
              <XCircle className="size-3.5 text-muted-foreground" />
              <span>Action cancelled by merchant.</span>
            </>
          )}
        </div>
      );
    }

    if (part.state === "output-available") {
      return (
        <div className="my-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="text-sm font-semibold">{executedTitle}</span>
            <Badge
              variant="outline"
              className="ml-auto border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              Executed in DB
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {String(outputData.message || "Database changes successfully committed.")}
          </p>
        </div>
      );
    }

    if (part.state === "output-denied") {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <XCircle className="size-3.5 text-muted-foreground" />
          <span>Action was denied. No database changes were made.</span>
        </div>
      );
    }
  }

  // Standard Tools (read-side introspection, queries, searches)
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
    ? "Running query…"
    : failed
      ? part.errorText ?? "Tool failed"
      : output?.status === "error"
        ? output.message ?? "No result"
        : output?.products !== undefined
          ? `${output.count ?? output.products.length} product(s) found`
          : output?.rowCount !== undefined
            ? `${output.rowCount} row(s) returned`
            : output?.tables !== undefined
              ? `${(output.tables as unknown[]).length} column(s) verified`
              : "Done";

  return (
    <div
      className={cn(
        "my-1.5 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
        failed
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : running
            ? "border-primary/20 bg-primary/5 text-muted-foreground"
            : "border-border/60 bg-muted/30 text-muted-foreground",
      )}
    >
      <span className="shrink-0">{running ? <Loader2 className="size-3.5 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium text-foreground">{toolName}</span>
        {running && input ? (
          <span className="ml-1.5 text-muted-foreground truncate">— {String((input as Record<string, unknown>).query ?? "")}</span>
        ) : null}
      </span>
      <span className="shrink-0 text-[11px] font-medium">{summary}</span>
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
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex size-7 shrink-0 select-none items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <Bot className="size-4" />
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-1 text-sm leading-relaxed",
          isUser
            ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-sm"
            : "max-w-[85%] rounded-2xl rounded-tl-sm border border-border/70 bg-card px-4 py-3 text-card-foreground shadow-sm",
        )}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            if (isUser) {
              return (
                <div key={index} className="whitespace-pre-wrap">
                  {part.text}
                </div>
              );
            }
            return <MarkdownRenderer key={index} content={part.text} />;
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

      {isUser && (
        <div className="flex size-7 shrink-0 select-none items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
          <User className="size-4" />
        </div>
      )}
    </div>
  );
}

export function NaturalLanguageQuery() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`
    : "http://localhost:4000/api/v1/copilot/chat";

  const { addToolApprovalResponse, error, messages, sendMessage, setMessages, status } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    transport: new DefaultChatTransport({
      api: apiUrl,
      headers: async () => {
        const { data } = await createClient().auth.getSession();
        return {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        };
      },
    }),
  });

  const isProcessing = status === "streaming" || status === "submitted";

  // Auto-scroll when new message parts stream in
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestionClick = (prompt: string) => {
    if (isProcessing) return;
    sendMessage({ text: prompt });
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Sleek GPT/Gemini-Style Top Bar */}
      <div className="flex h-13 shrink-0 items-center justify-between border-b border-border/60 px-4 lg:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Business Copilot
            </h1>
          </div>
          <Badge
            variant="outline"
            className="ml-2 hidden gap-1 border-primary/20 bg-primary/5 text-[10px] text-primary sm:flex"
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Live DB Grounding • RLS Protected
          </Badge>
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMessages([])}
            disabled={isProcessing}
          >
            <RotateCcw className="size-3.5" />
            New Chat
          </Button>
        )}
      </div>

      {/* Main Chat Conversation Canvas */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          /* Gemini/GPT-style Empty State */
          <div className="mx-auto flex max-w-2xl flex-col items-center justify-center pt-8 text-center sm:pt-16">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-purple-500/20 to-pink-500/20 p-3 shadow-inner">
              <Sparkles className="size-7 text-indigo-500 dark:text-indigo-400" />
            </div>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What would you like to know?
            </h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Ask about product stock, pricing, courier delivery success, or request live inventory updates.
            </p>

            {/* Clean Prompt Cards Grid */}
            <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
              {SUGGESTIONS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    onClick={() => handleSuggestionClick(item.prompt)}
                    disabled={isProcessing}
                    className="flex flex-col items-start rounded-xl border border-border/70 bg-card p-3.5 text-left transition-all hover:border-primary/40 hover:bg-muted/40 hover:shadow-sm"
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </div>
                    <span className="mt-2 text-xs font-semibold text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                      {item.prompt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Conversation Flow */
          <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                onApprovalResponse={addToolApprovalResponse}
              />
            ))}

            {isProcessing && status === "streaming" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-10">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                <span>Copilot is reasoning and querying database…</span>
              </div>
            )}

            {error && (
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <XCircle className="size-4 shrink-0" />
                <span>{error.message}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Input Bar (GPT / Gemini Style) */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/95 to-transparent pt-6 pb-4">
        <div className="mx-auto max-w-3xl px-4">
          <form
            onSubmit={handleSubmit}
            className="relative flex items-center rounded-2xl border border-border/80 bg-card p-1.5 shadow-lg shadow-black/5 ring-offset-background transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your catalogue, inventory, or couriers…"
              disabled={isProcessing}
              className="flex-1 bg-transparent px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isProcessing || !input.trim()}
              className="size-8 rounded-xl bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-30"
            >
              {isProcessing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </form>

          <p className="mt-2 text-center text-[10px] text-muted-foreground/80">
            PakCommerce AI Copilot is grounded in your workspace database. Guarded actions require your explicit approval.
          </p>
        </div>
      </div>
    </div>
  );
}
