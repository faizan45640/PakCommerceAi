// natural-language-query.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { CheckCircle2, Loader2, PackageSearch, Truck, XCircle } from "lucide-react";

const WRITE_TOOLS = new Set([
  "mutateDatabase",
  "updateProductStock",
  "updateProductPrice",
  "updateProductDetails",
]);

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

import { RafiqComposer } from "./rafiq-composer";
import { RafiqEmpty } from "./rafiq-empty";
import { RafiqMark } from "./rafiq-mark";

function formatRs(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Rs. —";
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

function shopStatus(status: unknown): string | null {
  if (status === "active") return "Live on your shop";
  if (status === "draft") return "Saved, not listed yet";
  if (status === "archived") return "Hidden from your shop";
  return null;
}

function productLabel(input: Record<string, unknown>): string {
  const product = String(input.productTitle || input.currentTitle || "this product");
  const variant = input.variantTitle ? ` (${String(input.variantTitle)})` : "";
  return `${product}${variant}`;
}

/** Plain sentences a shop owner can approve. SQL never appears here. */
function changeLines(toolName: string, input: Record<string, unknown>): string[] {
  if (toolName === "updateProductStock") {
    return [`Set ${productLabel(input)} to ${String(input.newQuantity ?? "?")} pieces.`];
  }

  if (toolName === "updateProductPrice") {
    const lines = [`Change the price of ${productLabel(input)} to ${formatRs(input.newPricePkr)}.`];
    if (input.compareAtPricePkr != null) {
      lines.push(`Show the crossed-out price as ${formatRs(input.compareAtPricePkr)}.`);
    }
    return lines;
  }

  if (toolName === "updateProductDetails") {
    const lines: string[] = [];
    const current = String(input.currentTitle || "this product");
    if (input.newTitle) lines.push(`Rename “${current}” to “${String(input.newTitle)}”.`);
    if (typeof input.newDescription === "string" && input.newDescription.trim()) {
      lines.push(`Update the description of ${current}.`);
    }
    const status = shopStatus(input.newStatus);
    if (status) lines.push(`Mark ${current} as ${status}.`);
    if (Array.isArray(input.newTags)) {
      lines.push(
        input.newTags.length > 0
          ? `Set tags to ${input.newTags.map(String).join(", ")}.`
          : `Clear the tags on ${current}.`,
      );
    }
    if (lines.length === 0) lines.push(`Update ${current}.`);
    return lines;
  }

  const summary = String(input.summary ?? "").trim();
  return [summary || "Rafiq wants to change something in your shop."];
}

function approvalTitle(toolName: string): string {
  if (toolName === "updateProductStock") return "Update stock?";
  if (toolName === "updateProductPrice") return "Change this price?";
  if (toolName === "updateProductDetails") return "Update this product?";
  return "Save this change?";
}

function savedTitle(toolName: string): string {
  if (toolName === "updateProductStock") return "Stock updated";
  if (toolName === "updateProductPrice") return "Price updated";
  if (toolName === "updateProductDetails") return "Product updated";
  return "Change saved";
}

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

function resolveToolName(part: ToolPartShape): string {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string") {
    return part.toolName;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return part.toolName ?? part.type;
}

/** Renders a single tool call or approval card inside an assistant message. */
function ToolCallCard({
  part,
  onApprovalResponse,
}: {
  part: ToolPartShape;
  onApprovalResponse?: ApprovalCallback;
}) {
  const toolName = resolveToolName(part);

  // Native Vercel AI SDK Human-in-the-Loop approval cards for guarded mutations
  if (WRITE_TOOLS.has(toolName)) {
    const inputData = (part.input ?? {}) as Record<string, unknown>;
    const outputData = (part.output ?? {}) as Record<string, unknown>;

    const lines = changeLines(toolName, inputData);
    const savedOk = outputData.status !== "error";

    if (part.state === "input-streaming" || part.state === "input-available") {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-amber-700" />
          <span>Preparing a change for your OK…</span>
        </div>
      );
    }

    if (part.state === "approval-requested") {
      return (
        <div className="my-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
            <span className="text-sm font-semibold">{approvalTitle(toolName)}</span>
            <Badge
              variant="outline"
              className="ml-auto border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
            >
              Needs your OK
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Nothing is saved until you say yes.
          </p>

          <ul className="mt-3 space-y-1 rounded-lg border border-border/60 bg-background/80 p-2.5 text-sm text-foreground">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          {part.approval?.id && onApprovalResponse ? (
            <div className="mt-3.5 flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-emerald-600 px-3.5 text-xs text-white hover:bg-emerald-700"
                onClick={() => onApprovalResponse({ id: part.approval!.id, approved: true })}
              >
                <CheckCircle2 className="size-3.5" />
                Yes, save it
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-border px-3.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onApprovalResponse({ id: part.approval!.id, approved: false })}
              >
                <XCircle className="size-3.5" />
                No, leave it
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Waiting for confirmation…</p>
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
              <span>Saving this to your shop…</span>
            </>
          ) : (
            <>
              <XCircle className="size-3.5 text-muted-foreground" />
              <span>Left as it is.</span>
            </>
          )}
        </div>
      );
    }

    if (part.state === "output-available") {
      if (!savedOk) {
        return (
          <div className="my-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <XCircle className="size-3.5 shrink-0" />
            <span>Rafiq could not save that. Your shop is unchanged.</span>
          </div>
        );
      }

      return (
        <div className="my-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 text-xs shadow-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="text-sm font-semibold">{savedTitle(toolName)}</span>
            <Badge
              variant="outline"
              className="ml-auto border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400"
            >
              Saved
            </Badge>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {String(outputData.message || lines[0] || "Saved to your shop.")}
          </p>
        </div>
      );
    }

    if (part.state === "output-denied") {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <XCircle className="size-3.5 text-muted-foreground" />
          <span>Nothing was changed.</span>
        </div>
      );
    }

    if (part.state === "output-error") {
      return (
        <div className="my-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="size-3.5 shrink-0" />
          <span>Rafiq could not prepare that change.</span>
        </div>
      );
    }
  }

  // Schema checks stay inside the copilot loop. The seller does not see them.
  if (toolName === "getSchema") return null;

  const running = part.state === "input-streaming" || part.state === "input-available";
  const failed = part.state === "output-error";

  const output = part.output as
    | {
        status?: string;
        count?: number;
        products?: unknown[];
        rowCount?: number;
      }
    | undefined;

  const label =
    toolName === "searchProducts"
      ? "Your products"
      : toolName === "getCourierPerformance"
        ? "Couriers"
        : "Your shop";

  const icon =
    toolName === "getCourierPerformance" ? (
      <Truck className="size-3.5" />
    ) : (
      <PackageSearch className="size-3.5" />
    );

  const summary = running
    ? "Checking…"
    : failed || output?.status === "error"
      ? "Could not check that"
      : output?.products !== undefined
        ? `Found ${output.count ?? output.products.length}`
        : output?.rowCount !== undefined
          ? `Found ${output.rowCount}`
          : "Done";

  return (
    <div
      className={cn(
        "my-1.5 flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
        failed || output?.status === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : running
            ? "border-primary/20 bg-primary/5 text-muted-foreground"
            : "border-border/60 bg-muted/30 text-muted-foreground",
      )}
    >
      <span className="shrink-0">{running ? <Loader2 className="size-3.5 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{label}</span>
      <span className="shrink-0 text-[11px] font-medium">{summary}</span>
    </div>
  );
}

function messageHasVisibleContent(message: UIMessage): boolean {
  return message.parts.some((part) => {
    if (part.type === "text") return part.text.trim().length > 0;
    if (isToolUIPart(part)) {
      const name = getToolName(part);
      return name !== "getSchema";
    }
    return false;
  });
}

function MessageBubble({
  message,
  onApprovalResponse,
  waiting,
}: {
  message: UIMessage;
  onApprovalResponse?: ApprovalCallback;
  waiting?: boolean;
}) {
  const isUser = message.role === "user";
  const visible = messageHasVisibleContent(message);

  return (
    <div className={cn("flex w-full gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && <RafiqMark size="md" className="mt-0.5" />}

      <div
        className={cn(
          "flex flex-col gap-1 text-[15px] leading-7",
          isUser
            ? "max-w-[75%] rounded-[1.4rem] rounded-br-md bg-muted px-4 py-2.5 text-foreground"
            : "max-w-[85%] px-1 py-0.5 text-foreground",
        )}
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            if (!part.text.trim()) return null;
            if (isUser) {
              return (
                <div key={index} className="whitespace-pre-wrap">
                  {part.text}
                </div>
              );
            }
            return <MarkdownRenderer key={index} content={part.text} />;
          }

          if (isToolUIPart(part)) {
            const toolPart = part as unknown as ToolPartShape;
            // Hide a failed attempt when a later call of the same tool succeeded.
            // Keeps retries from flashing red after the corrected call works.
            const toolFailed =
              toolPart.state === "output-error" ||
              (toolPart.state === "output-available" &&
                (toolPart.output as { status?: string } | undefined)?.status === "error");
            if (toolFailed) {
              const toolName = getToolName(part);
              const laterOk = message.parts.slice(index + 1).some((later) => {
                if (!isToolUIPart(later)) return false;
                if (getToolName(later) !== toolName) return false;
                if (later.state !== "output-available") return false;
                const out = later.output as { status?: string } | undefined;
                return out?.status !== "error";
              });
              if (laterOk) return null;
            }

            return (
              <ToolCallCard
                key={index}
                part={toolPart}
                onApprovalResponse={onApprovalResponse}
              />
            );
          }

          return null;
        })}

        {!isUser && !visible && waiting ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Rafiq is looking through your shop…</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NaturalLanguageQuery({
  chatId,
  initialMessages,
  takeOpening,
  onFinished,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  takeOpening: () => string | null;
  onFinished: () => void;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const rafScrollRef = useRef(0);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/copilot/chat`
    : "http://localhost:4000/api/v1/copilot/chat";

  const { addToolApprovalResponse, error, messages, sendMessage, status } = useChat({
    id: chatId,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: () => {
      onFinished();
    },
    transport: new DefaultChatTransport({
      api: apiUrl,
      headers: async () => {
        const { data } = await createClient().auth.getSession();
        return {
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        };
      },
      prepareSendMessagesRequest({ messages: nextMessages, id }) {
        return { body: { id, message: nextMessages[nextMessages.length - 1] } };
      },
    }),
  });

  const isProcessing = status === "streaming" || status === "submitted";

  useEffect(() => {
    const text = takeOpening();
    if (text) sendMessage({ text });
  }, [sendMessage, takeOpening]);

  // Pin to bottom while streaming. Instant scrollTop (coalesced via rAF) tracks
  // growing content smoothly; competing smooth scrollTo calls cause stutter.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    cancelAnimationFrame(rafScrollRef.current);
    rafScrollRef.current = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });

    return () => cancelAnimationFrame(rafScrollRef.current);
  }, [messages, isProcessing]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  const ask = (text: string) => {
    if (!text.trim() || isProcessing) return;
    stickToBottomRef.current = true;
    sendMessage({ text });
    setInput("");
  };

  if (messages.length === 0) {
    return (
      <RafiqEmpty
        input={input}
        onInputChange={setInput}
        busy={isProcessing}
        onSubmit={() => ask(input)}
        onSuggestion={ask}
      />
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center border-b border-border/50 px-4 lg:px-6">
        <h1 className="truncate text-sm font-medium tracking-tight text-foreground">Rafiq</h1>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-28">
          {messages.map((message, index) => {
            const isLast = index === messages.length - 1;
            return (
              <MessageBubble
                key={message.id}
                message={message}
                onApprovalResponse={addToolApprovalResponse}
                waiting={isProcessing && isLast && message.role === "assistant"}
              />
            );
          })}

          {isProcessing && messages[messages.length - 1]?.role !== "assistant" ? (
            <div className="flex items-center gap-3">
              <RafiqMark size="md" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Rafiq is looking through your shop…</span>
              </div>
            </div>
          ) : null}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              <XCircle className="size-4 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent pt-10 pb-5">
        <div className="pointer-events-auto mx-auto max-w-3xl px-4">
          <RafiqComposer
            value={input}
            onChange={setInput}
            onSubmit={() => ask(input)}
            busy={isProcessing}
          />
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground/70">
            Rafiq uses your real products. Nothing changes until you say yes.
          </p>
        </div>
      </div>
    </div>
  );
}
